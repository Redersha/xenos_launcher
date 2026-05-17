#!/bin/bash
# 一键构建并启动 Xenos Launcher
# 用法:
#   ./run.sh          # 直接运行已构建的分发包
#   ./run.sh --build  # 先构建再运行
#   ./run.sh --dev    # 开发模式运行

set -e
cd "$(dirname "$0")"

PKG_DIR="dist-pkg"
BUNDLE_DIR="dist-bundle"

# 开发模式
if [ "$1" = "--dev" ]; then
  echo "🔧 开发模式启动..."
  exec npm run dev
fi

# 检测当前平台
detect_platform() {
  local os arch
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  arch="$(uname -m)"

  case "$os" in
    darwin) os="macos" ;;
    linux)  os="linux" ;;
    mingw*|msys*|cygwin*) os="windows" ;;
    *) echo "❌ 不支持的操作系统: $os"; exit 1 ;;
  esac

  case "$arch" in
    arm64|aarch64) arch="arm64" ;;
    x86_64|amd64)  arch="x64" ;;
    *) echo "❌ 不支持的架构: $arch"; exit 1 ;;
  esac

  echo "xenos-launcher-${os}-${arch}"
}

# 构建模式
if [ "$1" = "--build" ]; then
  echo "📦 构建 bundle..."
  npm run bundle

  platform_name="$(detect_platform)"
  echo "📦 打包 ${platform_name}..."
  npm run "pack:${platform_name#xenos-launcher-}" 2>/dev/null || {
    # fallback: 用 current 模式打包
    node scripts/pack-dist.mjs current
  }
fi

# 查找匹配的分发包目录
platform_name="$(detect_platform)"
launcher_dir="${PKG_DIR}/${platform_name}"

if [ -d "$launcher_dir" ]; then
  echo "🚀 启动 ${platform_name}..."
  exec "${launcher_dir}/xl"
fi

# 没有已解压的目录，尝试从压缩包解压
archive_tar="${PKG_DIR}/${platform_name}.tar.gz"
archive_zip="${PKG_DIR}/${platform_name}.zip"

if [ -f "$archive_tar" ]; then
  echo "📦 解压 ${archive_tar}..."
  tar -xzf "$archive_tar" -C "$PKG_DIR"
  echo "🚀 启动 ${platform_name}..."
  exec "${launcher_dir}/xl"
elif [ -f "$archive_zip" ]; then
  echo "📦 解压 ${archive_zip}..."
  cd "$PKG_DIR" && unzip -o "${platform_name}.zip" && cd -
  echo "🚀 启动 ${platform_name}..."
  exec "${launcher_dir}/xl.cmd"
fi

# 没有分发包，尝试用 bundle 直接运行
if [ -f "${BUNDLE_DIR}/xl.js" ]; then
  echo "⚠️  未找到分发包，使用 bundle + 系统 Node.js 启动..."
  exec node "${BUNDLE_DIR}/xl.js"
fi

# 都没有，提示构建
echo "❌ 未找到构建产物。请先运行:"
echo "   ./run.sh --build"
echo "   或手动执行: npm run bundle && npm run pack:macos"
exit 1
