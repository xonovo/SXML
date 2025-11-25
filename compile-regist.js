// 临时脚本：编译 regist 页面
const SXMLCompiler = require('./utils/sxml.compiler.js');
const path = require('path');
const fs = require('fs');

const env = process.argv[2] || 'dev';
const compiler = new SXMLCompiler(env);

const sxmlPath = path.join(__dirname, 'pages/webapp/regist/regist.sxml');
const jsPath = path.join(__dirname, 'pages/webapp/regist/regist.js');
const outputPath = path.join(__dirname, 'dist/pages/webapp/regist/regist.html');
const jsonPath = path.join(__dirname, 'pages/webapp/regist/regist.json');

// 确保输出目录存在
const outputDir = path.dirname(outputPath);
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

console.log('开始编译 regist 页面...');
compiler.compile(sxmlPath, jsPath, outputPath, fs.existsSync(jsonPath) ? jsonPath : null);

// 复制资源文件
const srcDir = path.join(__dirname, 'pages/webapp/regist');
const destDir = path.join(__dirname, 'dist/pages/webapp/regist');

const resources = ['regist.css', 'regist.js'];
resources.forEach(file => {
  const src = path.join(srcDir, file);
  const dest = path.join(destDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`复制: ${file}`);
  }
});

console.log('✅ regist 页面编译完成！');
