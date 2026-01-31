# Mouth High

macOS 语音输入工具，使用 MLX Fun-ASR 模型进行语音识别。

## 功能特性

- **全局快捷键触发** - 按住 Option + Space 说话，松开识别
- **菜单栏图标** - 显示状态，快速访问
- **语音识别** - 使用 Fun-ASR-Nano 模型（本地运行）
- **文字输出** - 模拟键盘输入或复制到剪贴板

## 系统要求

- macOS（Apple Silicon，M 系列芯片）
- Python 3.10+
- 麦克风权限
- 辅助功能权限（用于模拟键盘输入）

## 安装

### 1. 安装 Python 依赖

```bash
cd src-python
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. 安装 Node.js 依赖

```bash
npm install
```

### 3. 运行开发版本

```bash
npm run tauri dev
```

### 4. 构建发布版本

```bash
npm run tauri build
```

## 使用方法

1. 启动应用后，会在菜单栏显示图标
2. 按住 `Option + Space` 开始说话
3. 松开按键，等待识别
4. 识别结果会自动输入到当前光标位置

## 权限设置

首次运行时需要授权以下权限：

1. **麦克风权限** - 用于录制语音
2. **辅助功能权限** - 用于模拟键盘输入（系统偏好设置 > 安全性与隐私 > 辅助功能）

## 项目结构

```
mouth-high/
├── src/                    # 前端 React 代码
├── src-tauri/              # Rust 后端代码
│   ├── src/
│   │   ├── main.rs         # 入口
│   │   ├── lib.rs          # 主逻辑
│   │   ├── audio.rs        # 音频录制
│   │   ├── hotkey.rs       # 全局快捷键
│   │   ├── tray.rs         # 系统托盘
│   │   ├── input.rs        # 键盘/剪贴板
│   │   └── sidecar.rs      # Python 进程通信
│   └── Cargo.toml
├── src-python/             # Python ASR 服务
│   ├── asr_service.py
│   └── requirements.txt
└── package.json
```

## 技术栈

- **前端**: React + TypeScript + Vite
- **后端**: Tauri (Rust)
- **ASR**: MLX Fun-ASR (Python)

## License

MIT
