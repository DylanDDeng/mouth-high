use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use hound::{WavSpec, WavWriter};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::path::PathBuf;
use std::thread::{self, JoinHandle};
use tempfile::NamedTempFile;

pub enum RecorderCommand {
    Start,
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

    pub fn start_recording(&self) -> Result<(), String> {
        self.command_tx
            .send(RecorderCommand::Start)
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
    // Stream is kept alive here to maintain recording; dropping it stops recording
    let mut _stream_holder: Option<cpal::Stream> = None;
    let mut sample_rate: u32 = 44100;

    loop {
        match command_rx.recv() {
            Ok(RecorderCommand::Start) => {
                // Clear samples
                if let Ok(mut s) = samples.lock() {
                    s.clear();
                }

                // Create stream
                match create_input_stream(Arc::clone(&samples)) {
                    Ok((stream, rate)) => {
                        sample_rate = rate;
                        if let Err(e) = stream.play() {
                            log::error!("Failed to start stream: {}", e);
                        } else {
                            log::info!("Recording started at {} Hz", sample_rate);
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
                // Channel closed, exit thread
                break;
            }
        }
    }
}

fn create_input_stream(
    samples: Arc<Mutex<Vec<f32>>>,
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

    let stream = match config.sample_format() {
        cpal::SampleFormat::F32 => {
            device
                .build_input_stream(
                    &config.into(),
                    move |data: &[f32], _: &cpal::InputCallbackInfo| {
                        if let Ok(mut s) = samples.lock() {
                            s.extend_from_slice(data);
                        }
                    },
                    err_fn,
                    None,
                )
                .map_err(|e| format!("Failed to build input stream: {}", e))?
        }
        cpal::SampleFormat::I16 => {
            device
                .build_input_stream(
                    &config.into(),
                    move |data: &[i16], _: &cpal::InputCallbackInfo| {
                        if let Ok(mut s) = samples.lock() {
                            let floats: Vec<f32> = data
                                .iter()
                                .map(|&sample| sample as f32 / i16::MAX as f32)
                                .collect();
                            s.extend(floats);
                        }
                    },
                    err_fn,
                    None,
                )
                .map_err(|e| format!("Failed to build input stream: {}", e))?
        }
        cpal::SampleFormat::U16 => {
            device
                .build_input_stream(
                    &config.into(),
                    move |data: &[u16], _: &cpal::InputCallbackInfo| {
                        if let Ok(mut s) = samples.lock() {
                            let floats: Vec<f32> = data
                                .iter()
                                .map(|&sample| {
                                    (sample as f32 - u16::MAX as f32 / 2.0)
                                        / (u16::MAX as f32 / 2.0)
                                })
                                .collect();
                            s.extend(floats);
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
