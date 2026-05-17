# 构建与使用指南

## 项目简介

Terminal Craft Launcher (TCL) — 一个基于终端 TUI 的 Minecraft Java Edition 启动器。

---

## 构建产物说明

| 目录 | 内容 | 说明 |
|------|------|------|
| `dist/` | TypeScript 编译输出（`tsc`） | 开发时使用，不可直接分发 |
| `dist-bundle/` | esbuild 打包的单文件 | `tcl.js`（约 2.3MB）+ `yoga.wasm`，需 Node.js 运行时 |
| `dist-pkg/` | 最终分发包 | 包含 Node.js 运行时的可分发压缩包 |

### 分发包结构

解压后目录结构：

```
terminal-craft-launcher-<平台>-<架构>/
├── tcl          # 启动脚本（Windows 为 tcl.cmd）
├── tcl.js       # 应用主程序（esbuild bundle）
├── yoga.wasm    # Ink 布局引擎 WASM 文件
└── node         # Node.js 运行时（Windows 为 node.exe）
```

### 分发包命名规则

| 平台 | 文件名 |
|------|--------|
| macOS Apple Silicon | `terminal-craft-launcher-macos-arm64.tar.gz` |
| macOS Intel | `terminal-craft-launcher-macos-x64.tar.gz` |
| Windows | `terminal-craft-launcher-windows-x64.zip` |
| Linux | `terminal-craft-launcher-linux-x64.tar.gz` |

---

## 构建步骤

### 1. 安装依赖

```bash
npm install
```

### 2. 打包 bundle

```bash
npm run bundle
```

此步骤使用 esbuild 将所有代码打包为 `dist-bundle/tcl.js` 单文件，并复制 `yoga.wasm` 到 `dist-bundle/`。

### 3. 生成分发包

```bash
# 当前平台
npm run pack:macos         # macOS ARM64（Apple Silicon）
npm run pack:macos-x64     # macOS Intel
npm run pack:win           # Windows x64
npm run pack:linux         # Linux x64
```

### 一键构建全部平台

```bash
npm run pack:all
```

> **注意**：跨平台打包时，Node.js 二进制会使用当前系统的。如需为其他平台构建，需手动替换对应平台的 Node.js 二进制。

---

## 使用方法

### macOS / Linux

```bash
# 1. 解压
tar -xzf terminal-craft-launcher-macos-arm64.tar.gz

# 2. 进入目录
cd terminal-craft-launcher-macos-arm64

# 3. 运行
./tcl
```

### Windows

```cmd
# 1. 解压 zip 文件

# 2. 进入目录

# 3. 运行
tcl.cmd
```

---

## 开发模式

```bash
# 编译并运行
npm run dev

# 监听模式（自动重新编译和运行）
npm run dev:watch
```

---

## 系统要求

- 运行分发包：无需安装 Node.js，包内已包含
- 开发构建：Node.js >= 20，npm
