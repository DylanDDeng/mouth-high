use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use hound::{WavSpec, WavWriter};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::path::PathBuf;
use std::thread::{self, JoinHandle};
use tempfile::NamedTempFile;
use tauri::{AppHandle, Emitter, Manager};

pub enum RecorderCommand {
    Start(Option<AppHandle>), // 可选的 AppHandle 用于发送实时音频数据
    Stop(Sender<Result<PathBuf, String>>),
}

pub struct AudioRecorderHandle {
    command_tx: Sender<RecorderCommand>,
    _thread: JoinHandle<()>,
}

impl AudioRecorderHandle {
    pub fn new() -> Result<Self, String> {
        let (command_tx, command_rx) = mpsc::channel();

        let thread = thread::spawn(move || {
            recorder_thread(command_rx);
        });

        Ok(Self {
            command_tx,
            _thread: thread,
        })
    }

    pub fn start_recording(&self, app_handle: Option<AppHandle>) -> Result<(), String> {
        self.command_tx
            .send(RecorderCommand::Start(app_handle))
            .map_err(|e| format!("Failed to send start command: {}", e))
    }

    pub fn stop_recording(&self) -> Result<PathBuf, String> {
        let (result_tx, result_rx) = mpsc::channel();
        self.command_tx
            .send(RecorderCommand::Stop(result_tx))
            .map_err(|e| format!("Failed to send stop command: {}", e))?;

        result_rx
            .recv()
            .map_err(|e| format!("Failed to receive result: {}", e))?
    }
}

fn recorder_thread(command_rx: Receiver<RecorderCommand>) {
    let samples: Arc<Mutex<Vec<f32>>> = Arc::new(Mutex::new(Vec::new()));
    let mut _stream_holder: Option<cpal::Stream> = None;
    let mut sample_rate: u32 = 44100;

    loop {
        match command_rx.recv() {
            Ok(RecorderCommand::Start(handle)) => {
                // Clear samples
                if let Ok(mut s) = samples.lock() {
                    s.clear();
                }

                // Create stream with amplitude monitoring
                match create_input_stream_with_amplitude(
                    Arc::clone(&samples),
                    handle.clone(),
                ) {
                    Ok((stream, rate)) => {
                        sample_rate = rate;
                        if let Err(e) = stream.play() {
                            log::error!("Failed to start stream: {}", e);
                        } else {
                            log::info!("Recording started at {} Hz with amplitude monitoring", sample_rate);
                            _stream_holder = Some(stream);
                        }
                    }
                    Err(e) => {
                        log::error!("Failed to create stream: {}", e);
                    }
                }
            }
            Ok(RecorderCommand::Stop(result_tx)) => {
                // Stop stream
                _stream_holder = None;

                // Save to file
                let result = save_samples_to_wav(&samples, sample_rate);
                let _ = result_tx.send(result);
            }
            Err(_) => {
                break;
            }
        }
    }
}

fn create_input_stream_with_amplitude(
    samples: Arc<Mutex<Vec<f32>>>,
    app_handle: Option<AppHandle>,
) -> Result<(cpal::Stream, u32), String> {
    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or("No input device available")?;

    let config = device
        .default_input_config()
        .map_err(|e| format!("Failed to get default input config: {}", e))?;

    let sample_rate = config.sample_rate().0;
    let err_fn = |err| log::error!("Audio stream error: {}", err);

    // 用于计算音量的变量
    let amplitude_counter = Arc::new(Mutex::new(0u64));
    let amplitude_sum = Arc::new(Mutex::new(0.0f32));
    let last_emit_time = Arc::new(Mutex::new(std::time::Instant::now()));

    let stream = match config.sample_format() {
        cpal::SampleFormat::F32 => {
            let samples_clone = Arc::clone(&samples);
            let amp_counter_clone = Arc::clone(&amplitude_counter);
            let amp_sum_clone = Arc::clone(&amplitude_sum);
            let last_emit_clone = Arc::clone(&last_emit_time);
            
            device
                .build_input_stream(
                    &config.into(),
                    move |data: &[f32], _: &cpal::InputCallbackInfo| {
                        // 存储样本
                        if let Ok(mut s) = samples_clone.lock() {
                            s.extend_from_slice(data);
                        }
                        
                        // 计算音量
                        let mut sum = 0.0f32;
                        for &sample in data {
                            sum += sample.abs();
                        }
                        let avg = sum / data.len() as f32;
                        
                        // 累积音量数据
                        if let Ok(mut counter) = amp_counter_clone.lock() {
                            *counter += data.len() as u64;
                        }
                        if let Ok(mut sum_val) = amp_sum_clone.lock() {
                            *sum_val += avg * data.len() as f32;
                        }
                        
                        // 每 50ms 发送一次音量数据
                        if let Ok(mut last_time) = last_emit_clone.lock() {
                            if last_time.elapsed().as_millis() >= 50 {
                                if let (Ok(counter), Ok(sum_val)) = (amp_counter_clone.lock(), amp_sum_clone.lock()) {
                                    if *counter > 0 {
                                        let amplitude = *sum_val / *counter as f32;
                                        // 归一化到 0-1 范围，并增强效果
                                        let normalized = (amplitude * 5.0).min(1.0);
                                        
                                        if let Some(ref handle) = app_handle {
                                            // 尝试发送到 recording-bar 窗口
                                            if let Some(window) = handle.get_webview_window("recording-bar") {
                                                let _ = window.emit("audio-amplitude", normalized);
                                            }
                                            log::debug!("Audio amplitude: {:.3}", normalized);
                                        }
                                    }
                                }
                                *last_time = std::time::Instant::now();
                                if let Ok(mut c) = amp_counter_clone.lock() { *c = 0; }
                                if let Ok(mut s) = amp_sum_clone.lock() { *s = 0.0; }
                            }
                        }
                    },
                    err_fn,
                    None,
                )
                .map_err(|e| format!("Failed to build input stream: {}", e))?
        }
        cpal::SampleFormat::I16 => {
            let samples_clone = Arc::clone(&samples);
            let amp_counter_clone = Arc::clone(&amplitude_counter);
            let amp_sum_clone = Arc::clone(&amplitude_sum);
            let last_emit_clone = Arc::clone(&last_emit_time);
            
            device
                .build_input_stream(
                    &config.into(),
                    move |data: &[i16], _: &cpal::InputCallbackInfo| {
                        // 存储样本
                        if let Ok(mut s) = samples_clone.lock() {
                            let floats: Vec<f32> = data
                                .iter()
                                .map(|&sample| sample as f32 / i16::MAX as f32)
                                .collect();
                            s.extend(floats);
                        }
                        
                        // 计算音量
                        let mut sum = 0.0f32;
                        for &sample in data {
                            sum += (sample as f32 / i16::MAX as f32).abs();
                        }
                        let avg = sum / data.len() as f32;
                        
                        if let Ok(mut counter) = amp_counter_clone.lock() {
                            *counter += data.len() as u64;
                        }
                        if let Ok(mut sum_val) = amp_sum_clone.lock() {
                            *sum_val += avg * data.len() as f32;
                        }
                        
                        if let Ok(mut last_time) = last_emit_clone.lock() {
                            if last_time.elapsed().as_millis() >= 50 {
                                if let (Ok(counter), Ok(sum_val)) = (amp_counter_clone.lock(), amp_sum_clone.lock()) {
                                    if *counter > 0 {
                                        let amplitude = *sum_val / *counter as f32;
                                        let normalized = (amplitude * 5.0).min(1.0);
                                        
                                        if let Some(ref handle) = app_handle {
                                            let _ = handle.emit("audio-amplitude", normalized);
                                        }
                                    }
                                }
                                *last_time = std::time::Instant::now();
                                if let Ok(mut c) = amp_counter_clone.lock() { *c = 0; }
                                if let Ok(mut s) = amp_sum_clone.lock() { *s = 0.0; }
                            }
                        }
                    },
                    err_fn,
                    None,
                )
                .map_err(|e| format!("Failed to build input stream: {}", e))?
        }
        cpal::SampleFormat::U16 => {
            let samples_clone = Arc::clone(&samples);
            let amp_counter_clone = Arc::clone(&amplitude_counter);
            let amp_sum_clone = Arc::clone(&amplitude_sum);
            let last_emit_clone = Arc::clone(&last_emit_time);
            
            device
                .build_input_stream(
                    &config.into(),
                    move |data: &[u16], _: &cpal::InputCallbackInfo| {
                        // 存储样本
                        if let Ok(mut s) = samples_clone.lock() {
                            let floats: Vec<f32> = data
                                .iter()
                                .map(|&sample| {
                                    (sample as f32 - u16::MAX as f32 / 2.0)
                                        / (u16::MAX as f32 / 2.0)
                                })
                                .collect();
                            s.extend(floats);
                        }
                        
                        // 计算音量
                        let mut sum = 0.0f32;
                        for &sample in data {
                            let normalized = (sample as f32 - u16::MAX as f32 / 2.0) 
                                / (u16::MAX as f32 / 2.0);
                            sum += normalized.abs();
                        }
                        let avg = sum / data.len() as f32;
                        
                        if let Ok(mut counter) = amp_counter_clone.lock() {
                            *counter += data.len() as u64;
                        }
                        if let Ok(mut sum_val) = amp_sum_clone.lock() {
                            *sum_val += avg * data.len() as f32;
                        }
                        
                        if let Ok(mut last_time) = last_emit_clone.lock() {
                            if last_time.elapsed().as_millis() >= 50 {
                                if let (Ok(counter), Ok(sum_val)) = (amp_counter_clone.lock(), amp_sum_clone.lock()) {
                                    if *counter > 0 {
                                        let amplitude = *sum_val / *counter as f32;
                                        let normalized = (amplitude * 5.0).min(1.0);
                                        
                                        if let Some(ref handle) = app_handle {
                                            let _ = handle.emit("audio-amplitude", normalized);
                                        }
                                    }
                                }
                                *last_time = std::time::Instant::now();
                                if let Ok(mut c) = amp_counter_clone.lock() { *c = 0; }
                                if let Ok(mut s) = amp_sum_clone.lock() { *s = 0.0; }
                            }
                        }
                    },
                    err_fn,
                    None,
                )
                .map_err(|e| format!("Failed to build input stream: {}", e))?
        }
        _ => return Err("Unsupported sample format".to_string()),
    };

    Ok((stream, sample_rate))
}

fn save_samples_to_wav(
    samples: &Arc<Mutex<Vec<f32>>>,
    sample_rate: u32,
) -> Result<PathBuf, String> {
    let samples = {
        let s = samples.lock().map_err(|e| e.to_string())?;
        s.clone()
    };

    if samples.is_empty() {
        return Err("No audio recorded".to_string());
    }

    log::info!("Recorded {} samples", samples.len());

    // Create temp file
    let temp_file = NamedTempFile::new()
        .map_err(|e| format!("Failed to create temp file: {}", e))?;
    let path = temp_file.path().with_extension("wav");

    // Write WAV file
    let spec = WavSpec {
        channels: 1,
        sample_rate,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };

    let mut writer = WavWriter::create(&path, spec)
        .map_err(|e| format!("Failed to create WAV writer: {}", e))?;

    for sample in &samples {
        let amplitude = (sample * i16::MAX as f32) as i16;
        writer
            .write_sample(amplitude)
            .map_err(|e| format!("Failed to write sample: {}", e))?;
    }

    writer
        .finalize()
        .map_err(|e| format!("Failed to finalize WAV: {}", e))?;

    // Keep the temp file from being deleted
    temp_file.keep().map_err(|e| format!("Failed to keep temp file: {}", e))?;

    log::info!("Audio saved to: {:?}", path);

    Ok(path)
}
