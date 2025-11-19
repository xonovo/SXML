// 自动化构建脚本：一键输出 dist 目录结构，自动收集依赖资源
// 用法：
//   node build.dist.js              # 默认生产环境
//   node build.dist.js dev          # 开发环境
//   node build.dist.js test         # 测试环境
//   node build.dist.js prod         # 生产环境

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DIST = path.resolve(__dirname, 'dist');
const SRC = __dirname;
const ENV = process.argv[2] || process.env.NODE_ENV || 'production';

console.log('═══════════════════════════════════════');
console.log('  SXML 自动化构建工具');
console.log(`  环境: ${ENV.toUpperCase()}`);
console.log('═══════════════════════════════════════\n');

// 工具函数：递归复制目录
function copyDir(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return;
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  for (const file of fs.readdirSync(srcDir)) {
    const srcFile = path.join(srcDir, file);
    const destFile = path.join(destDir, file);
    if (fs.statSync(srcFile).isDirectory()) {
      copyDir(srcFile, destFile);
    } else {
      fs.copyFileSync(srcFile, destFile);
    }
  }
}

// 步骤 1: 清空 dist 目录
function cleanDist() {
  console.log('🧹 清空 dist 目录...');
  if (fs.existsSync(DIST)) {
    fs.rmSync(DIST, { recursive: true, force: true });
  }
  fs.mkdirSync(DIST);
}

// 步骤 2: 运行 build.js 预编译页面到 dist/pages
function buildPages() {
  console.log('📦 预编译 SXML 页面...\n');
  execSync(`node build.js ${ENV}`, { stdio: 'inherit' });
  console.log();
}

// 步骤 3: 复制静态资源目录
function copyStaticDirs() {
  console.log('📋 复制静态资源...');
  ['css', 'images', 'locales', 'config'].forEach(dir => {
    const srcDir = path.join(SRC, dir);
    const destDir = path.join(DIST, dir);
    if (fs.existsSync(srcDir)) {
      copyDir(srcDir, destDir);
      console.log(`  ✓ ${dir}/`);
    }
  });
}

// 附加：复制根级别的通用入口脚本（app.js）到 dist 根目录
function copyRootAppJs() {
  try {
    const src = path.join(SRC, 'app.js');
    const dest = path.join(DIST, 'app.js');
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      console.log('  ✓ app.js');
    } else {
      console.warn('  ⚠️ 未找到根级 app.js，某些页面的 <script src="../../app.js"> 可能 404');
    }
  } catch (e) {
    console.warn('  ⚠️ 复制 app.js 失败：', e.message);
  }
}

// 步骤 4: 复制 utils 依赖（扫描 HTML 中引用的 js）
function copyUtilsUsedByPages() {
  console.log('📚 复制 utils 依赖...');
  const utilsSrc = path.join(SRC, 'utils');
  const utilsDist = path.join(DIST, 'utils');
  if (!fs.existsSync(utilsDist)) fs.mkdirSync(utilsDist, { recursive: true });
  
  // 扫描所有编译后的 HTML 文件
  const pagesDir = path.join(DIST, 'pages');
  const usedJs = new Set();
  
  function scanHtmlFiles(dir) {
    if (!fs.existsSync(dir)) return;
    for (const file of fs.readdirSync(dir)) {
      const fullPath = path.join(dir, file);
      if (fs.statSync(fullPath).isDirectory()) {
        scanHtmlFiles(fullPath);
      } else if (file.endsWith('.html')) {
        const html = fs.readFileSync(fullPath, 'utf8');
        // 匹配 <script src="../../utils/xxx.js"> 或 <script src="../utils/xxx.js">
        const regex = /<script[^>]+src=["'][\.\/]*utils\/([^"']+\.js)["']/g;
        let m;
        while ((m = regex.exec(html))) {
          usedJs.add(m[1]);
        }
      }
    }
  }
  
  scanHtmlFiles(pagesDir);
  
  // 复制依赖的 js
  for (const js of usedJs) {
    const src = path.join(utilsSrc, js);
    const dest = path.join(utilsDist, js);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      console.log(`  ✓ utils/${js}`);
    }
  }

  // 兜底：拷贝整个 utils 目录，避免遗漏（例如正则未匹配到带参数的 script 或运行时动态加载）
  try {
    copyDir(utilsSrc, utilsDist);
    console.log('  ✓ utils/ (full)');
  } catch (e) {
    console.warn('  ⚠️ utils 全量复制失败：', e.message);
  }
}

// 步骤 5: 复制 index.html 到 dist 根目录
function copyIndex() {
  console.log('📄 生成站点首页 index.html...');
  const compiledIndex = path.join(DIST, 'pages', 'index', 'index.html');
  const legacyIndex = path.join(SRC, 'index.html');
  const dest = path.join(DIST, 'index.html');

  if (fs.existsSync(compiledIndex)) {
    fs.copyFileSync(compiledIndex, dest);
    console.log('  ✓ 来自 pages/index/index.html');
  } else if (fs.existsSync(legacyIndex)) {
    fs.copyFileSync(legacyIndex, dest);
              // 允许带版本参数（?v=...）或其他查询串，例如 /utils/i18n.js?v=123
              const regex = /<script[^>]+src=["'][\.\/?]*utils\/([^"']+\.js)(?:\?[^"']*)?["']/g;
  } else {
    console.warn('  ⚠️ 未找到首页源码（pages/index 或根目录 index.html）');
  }
}

// 步骤 6: 复制文档资源
function copyDocs() {
  console.log('📖 复制文档资源...');
  
  // 复制 README.md
  const readmeSrc = path.join(SRC, 'README.md');
  const readmeDest = path.join(DIST, 'README.md');
  if (fs.existsSync(readmeSrc)) {
    fs.copyFileSync(readmeSrc, readmeDest);
    console.log('  ✓ README.md');
  }
  
  // 复制 docs 文件夹
  const docsSrc = path.join(SRC, 'docs');
  const docsDest = path.join(DIST, 'docs');
  if (fs.existsSync(docsSrc)) {
    copyDir(docsSrc, docsDest);
    console.log('  ✓ docs/');
  }
}

// 主流程
cleanDist();
buildPages();
copyStaticDirs();
copyRootAppJs();
copyUtilsUsedByPages();
// 额外复制 pages/webapp/vendor 依赖（本地 Swiper 等第三方库）
(function copyWebappVendors(){
  const srcVendor = path.join(SRC, 'pages', 'webapp', 'vendor');
  const destVendor = path.join(DIST, 'pages', 'webapp', 'vendor');
  if (fs.existsSync(srcVendor)) {
    copyDir(srcVendor, destVendor);
    console.log('  ✓ pages/webapp/vendor/');
  }
})();
copyIndex();
copyDocs();

console.log('\n═══════════════════════════════════════');
console.log('  ✅ 构建完成！');
console.log(`  输出目录: ${DIST}`);
console.log('═══════════════════════════════════════');
