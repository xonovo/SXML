# 文件上传下载 API 使用指南

文件 API 模块 (`utils/fileapi.js`) 提供了完整的文件上传、下载、预览功能，支持文件验证、图片压缩、分片上传和进度监控。

## 目录
- [快速开始](#快速开始)
- [配置选项](#配置选项)
- [API 参考](#api-参考)
- [最佳实践](#最佳实践)
- [故障排查](#故障排查)

---

## 快速开始

### 1. 配置文件上传

编辑 `config/app.config.js`（或对应环境的 `app.config.{env}.js`）：

```json
{
  "api": {
    "baseUrl": "https://api.example.com",
    "uploadUrl": "https://api.example.com/upload",
    "downloadUrl": "https://api.example.com/download"
  },
  "upload": {
    "maxFileSize": 10485760,
    "maxFileSizeMB": 10,
    "allowedTypes": [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "application/pdf"
    ],
    "allowedExtensions": [
      ".jpg",
      ".jpeg",
      ".png",
      ".gif",
      ".webp",
      ".pdf"
    ],
    "imageMaxWidth": 4096,
    "imageMaxHeight": 4096,
    "chunkSize": 1048576,
    "enableChunkUpload": true
  }
}
```

### 2. 引入模块

在 HTML 页面中引入：

```html
<script src="../../utils/fileapi.js"></script>
```

### 3. 基础使用

#### 文件上传

```html
<input type="file" id="fileInput" accept="image/*,application/pdf">
<button onclick="uploadFile()">上传</button>
<div id="progress"></div>
```

```javascript
async function uploadFile() {
  const input = document.getElementById('fileInput');
  const file = input.files[0];
  
  if (!file) {
    alert('请选择文件');
    return;
  }

  try {
    // 上传文件
    const result = await fileapi.upload(file, {
      // 进度回调
      onProgress: (percent, loaded, total) => {
        document.getElementById('progress').textContent = 
          `上传进度: ${percent}% (${fileapi.formatFileSize(loaded)} / ${fileapi.formatFileSize(total)})`;
      },
      
      // 额外数据
      data: {
        category: 'avatar',
        userId: '12345'
      }
    });

    console.log('Upload success:', result);
    alert('上传成功！');

  } catch (error) {
    console.error('Upload error:', error);
    alert('上传失败：' + error.message);
  }
}
```

#### 文件下载

```javascript
async function downloadFile(fileId) {
  try {
    await fileapi.download(fileId, {
      filename: 'my-document.pdf'
    });
    
    console.log('Download started');

  } catch (error) {
    console.error('Download error:', error);
    alert('下载失败：' + error.message);
  }
}
```

#### 文件预览

```javascript
// 新窗口预览
fileapi.preview('file-id-123');

// 获取文件 URL（用于 img、video 等）
const imageUrl = fileapi.getFileUrl('image-id-456');
document.getElementById('preview').src = imageUrl;
```

---

## 配置选项

### 全局配置（config/app.config.js）

```json
{
  "upload": {
    "maxFileSize": 10485760,          // 最大文件大小（字节），默认 10MB
    "maxFileSizeMB": 10,               // 最大文件大小（MB），用于显示
    "allowedTypes": [                  // 允许的 MIME 类型
      "image/jpeg",
      "image/png",
      "application/pdf"
    ],
    "allowedExtensions": [             // 允许的文件扩展名
      ".jpg",
      ".jpeg",
      ".png",
      ".pdf"
    ],
    "imageMaxWidth": 4096,             // 图片最大宽度（像素）
    "imageMaxHeight": 4096,            // 图片最大高度（像素）
    "chunkSize": 1048576,              // 分片大小（字节），默认 1MB
    "enableChunkUpload": true          // 是否启用分片上传
  }
}
```

### 构造函数参数

```javascript
const customFileAPI = new FileAPIManager({
  // API 端点
  uploadUrl: 'https://api.example.com/upload',
  downloadUrl: 'https://api.example.com/download',
  
  // 文件限制
  maxFileSize: 20 * 1024 * 1024, // 20MB
  allowedTypes: ['image/jpeg', 'image/png'],
  allowedExtensions: ['.jpg', '.png'],
  
  // 图片配置
  imageMaxWidth: 2048,
  imageMaxHeight: 2048,
  imageQuality: 0.85,
  autoCompress: true,
  
  // 分片上传
  chunkSize: 2 * 1024 * 1024, // 2MB
  enableChunkUpload: true,
  
  // 请求配置
  withCredentials: true,
  headers: {
    'X-Custom-Header': 'value'
  },
  
  // 调试模式
  debug: true
});
```

---

## API 参考

### 文件验证

#### `validateFile(file): object`
验证文件是否符合配置要求

```javascript
const validation = fileapi.validateFile(file);

if (validation.valid) {
  console.log('File is valid');
} else {
  console.error('Validation errors:', validation.errors);
  // ["文件大小超过限制 (最大 10.00MB)", "不支持的文件类型: image/bmp"]
}
```

**返回值**：
```javascript
{
  valid: boolean,
  errors: string[]
}
```

### 文件上传

#### `upload(file, options): Promise<object>`
上传单个文件

```javascript
const result = await fileapi.upload(file, {
  // 上传 URL（可选，默认使用配置的 uploadUrl）
  url: 'https://custom-upload-url.com/upload',
  
  // 进度回调
  onProgress: (percent, loaded, total) => {
    console.log(`Progress: ${percent}%`);
  },
  
  // 取消回调（返回取消函数）
  onCancel: (cancelFn) => {
    window.cancelUpload = cancelFn;
  },
  
  // 额外数据
  data: {
    category: 'document',
    userId: '123'
  },
  
  // 自定义请求头
  headers: {
    'X-Custom-Header': 'value'
  }
});

// 取消上传
// window.cancelUpload();
```

#### `uploadMultiple(files, options): Promise<array>`
批量上传文件

```javascript
const results = await fileapi.uploadMultiple(files, {
  onProgress: (index, percent, loaded, total) => {
    console.log(`File ${index}: ${percent}%`);
  }
});

results.forEach((result, index) => {
  if (result.success) {
    console.log(`File ${index} uploaded:`, result.result);
  } else {
    console.error(`File ${index} failed:`, result.error);
  }
});
```

#### `compressImage(file, options): Promise<File>`
压缩图片

```javascript
const compressed = await fileapi.compressImage(file, {
  maxWidth: 1920,
  maxHeight: 1080,
  quality: 0.8
});

console.log('Original size:', fileapi.formatFileSize(file.size));
console.log('Compressed size:', fileapi.formatFileSize(compressed.size));
```

### 文件下载

#### `download(fileId, options): Promise<object>`
下载文件

```javascript
await fileapi.download('file-id-123', {
  // 自定义文件名
  filename: 'my-document.pdf',
  
  // 自定义下载 URL
  url: 'https://custom-download-url.com/file-id-123'
});
```

#### `preview(fileId, options): Promise<object>`
预览文件（新窗口打开）

```javascript
// 新窗口预览
await fileapi.preview('file-id-123');

// 当前窗口打开
await fileapi.preview('file-id-123', {
  newWindow: false
});
```

#### `getFileUrl(fileId, options): string`
获取文件 URL

```javascript
const url = fileapi.getFileUrl('image-id-456');

// 用于 img 标签
document.getElementById('avatar').src = url;

// 用于 video 标签
document.getElementById('video').src = url;

// 用于 a 标签
document.getElementById('download-link').href = url;
```

### 文件读取

#### `readAsDataURL(file): Promise<string>`
读取文件为 Base64 Data URL

```javascript
const dataUrl = await fileapi.readAsDataURL(file);
document.getElementById('preview').src = dataUrl;
```

#### `readAsText(file, encoding): Promise<string>`
读取文件为文本

```javascript
const text = await fileapi.readAsText(file, 'UTF-8');
console.log('File content:', text);
```

#### `readAsArrayBuffer(file): Promise<ArrayBuffer>`
读取文件为 ArrayBuffer

```javascript
const buffer = await fileapi.readAsArrayBuffer(file);
console.log('Buffer size:', buffer.byteLength);
```

### 工具方法

#### `formatFileSize(bytes): string`
格式化文件大小

```javascript
console.log(fileapi.formatFileSize(1024));        // "1 KB"
console.log(fileapi.formatFileSize(1048576));     // "1 MB"
console.log(fileapi.formatFileSize(1073741824));  // "1 GB"
```

---

## 最佳实践

### 1. 完整的文件上传示例

```html
<div class="upload-container">
  <input type="file" id="fileInput" accept="image/*" multiple>
  <button onclick="uploadFiles()">上传</button>
  <div id="fileList"></div>
  <div id="progress"></div>
</div>
```

```javascript
Page({
  data: {
    uploadedFiles: []
  },

  async uploadFiles() {
    const input = document.getElementById('fileInput');
    const files = Array.from(input.files);

    if (files.length === 0) {
      alert('请选择文件');
      return;
    }

    // 显示文件列表
    this.displayFileList(files);

    try {
      // 批量上传
      const results = await fileapi.uploadMultiple(files, {
        onProgress: (index, percent, loaded, total) => {
          this.updateProgress(index, percent);
        }
      });

      // 处理结果
      const successful = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);

      if (successful.length > 0) {
        this.setData({
          uploadedFiles: [...this.data.uploadedFiles, ...successful.map(r => r.result)]
        });
      }

      if (failed.length > 0) {
        alert(`${failed.length} 个文件上传失败`);
      } else {
        alert('所有文件上传成功！');
      }

    } catch (error) {
      console.error('Upload error:', error);
      alert('上传失败：' + error.message);
    }
  },

  displayFileList(files) {
    const html = files.map((file, index) => `
      <div class="file-item" data-index="${index}">
        <span>${file.name}</span>
        <span>${fileapi.formatFileSize(file.size)}</span>
        <div class="progress-bar">
          <div class="progress-fill" style="width: 0%"></div>
        </div>
      </div>
    `).join('');
    
    document.getElementById('fileList').innerHTML = html;
  },

  updateProgress(index, percent) {
    const item = document.querySelector(`.file-item[data-index="${index}"]`);
    if (item) {
      const fill = item.querySelector('.progress-fill');
      fill.style.width = percent + '%';
    }
  }
});
```

### 2. 图片预览和压缩

```javascript
async function handleImageSelect(file) {
  // 验证文件
  const validation = fileapi.validateFile(file);
  if (!validation.valid) {
    alert(validation.errors.join('\n'));
    return;
  }

  // 显示原始预览
  const originalUrl = await fileapi.readAsDataURL(file);
  document.getElementById('original-preview').src = originalUrl;
  document.getElementById('original-size').textContent = 
    `原始大小: ${fileapi.formatFileSize(file.size)}`;

  // 压缩图片
  const compressed = await fileapi.compressImage(file, {
    maxWidth: 1920,
    maxHeight: 1080,
    quality: 0.85
  });

  // 显示压缩后预览
  const compressedUrl = await fileapi.readAsDataURL(compressed);
  document.getElementById('compressed-preview').src = compressedUrl;
  document.getElementById('compressed-size').textContent = 
    `压缩后: ${fileapi.formatFileSize(compressed.size)}`;

  // 上传压缩后的文件
  const result = await fileapi.upload(compressed, {
    onProgress: (percent) => {
      console.log(`上传进度: ${percent}%`);
    }
  });

  console.log('上传成功:', result);
}
```

### 3. 大文件分片上传

```javascript
async function uploadLargeFile(file) {
  console.log('文件大小:', fileapi.formatFileSize(file.size));

  // 大于 2MB 自动启用分片上传
  const result = await fileapi.upload(file, {
    onProgress: (percent, loaded, total) => {
      document.getElementById('progress').innerHTML = `
        <div>上传进度: ${percent}%</div>
        <div>${fileapi.formatFileSize(loaded)} / ${fileapi.formatFileSize(total)}</div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${percent}%"></div>
        </div>
      `;
    }
  });

  console.log('上传完成:', result);
}
```

### 4. 拖拽上传

```html
<div id="dropZone" class="drop-zone">
  拖拽文件到这里
</div>
```

```javascript
const dropZone = document.getElementById('dropZone');

// 阻止默认行为
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
  dropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
});

// 拖拽进入
['dragenter', 'dragover'].forEach(eventName => {
  dropZone.addEventListener(eventName, () => {
    dropZone.classList.add('drag-over');
  });
});

// 拖拽离开
['dragleave', 'drop'].forEach(eventName => {
  dropZone.addEventListener(eventName, () => {
    dropZone.classList.remove('drag-over');
  });
});

// 文件放下
dropZone.addEventListener('drop', async (e) => {
  const files = Array.from(e.dataTransfer.files);
  
  for (const file of files) {
    try {
      await fileapi.upload(file, {
        onProgress: (percent) => {
          console.log(`${file.name}: ${percent}%`);
        }
      });
    } catch (error) {
      console.error(`${file.name} 上传失败:`, error);
    }
  }
});
```

### 5. 文件下载和预览

```javascript
// 显示文件列表
Page({
  data: {
    files: [
      { id: 'file-1', name: 'document.pdf', size: 1024000 },
      { id: 'file-2', name: 'image.jpg', size: 512000 }
    ]
  },

  // 下载文件
  async downloadFile(fileId, fileName) {
    try {
      await fileapi.download(fileId, { filename: fileName });
      console.log('下载开始');
    } catch (error) {
      alert('下载失败：' + error.message);
    }
  },

  // 预览文件
  previewFile(fileId) {
    fileapi.preview(fileId);
  },

  // 显示图片
  showImage(fileId) {
    const url = fileapi.getFileUrl(fileId);
    const img = document.createElement('img');
    img.src = url;
    document.body.appendChild(img);
  }
});
```

---

## 故障排查

### 问题 1: 文件验证失败

**症状**: 提示"不支持的文件类型"或"文件大小超过限制"

**解决方案**:
1. 检查 `config/app.config.js` 中的 `upload.allowedTypes` 和 `upload.allowedExtensions`
2. 检查 `upload.maxFileSize` 是否足够大
3. 确认文件实际类型和扩展名

```javascript
// 查看文件详情
console.log('File type:', file.type);
console.log('File name:', file.name);
console.log('File size:', file.size);

// 手动验证
const validation = fileapi.validateFile(file);
console.log('Validation:', validation);
```

### 问题 2: 上传失败（CORS 错误）

**症状**: 控制台显示 CORS 相关错误

**解决方案**:
后端需要设置正确的 CORS 头，参考 `docs/CORS_SOLUTION.md`

```javascript
// Node.js Express 示例
app.use('/upload', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'https://your-domain.com');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, x-user-account');
  res.header('Access-Control-Allow-Credentials', 'true');
  next();
});
```

### 问题 3: 大文件上传超时

**症状**: 上传大文件时中途失败

**解决方案**:
1. 启用分片上传
2. 调整分片大小
3. 检查服务端超时设置

```json
{
  "upload": {
    "enableChunkUpload": true,
    "chunkSize": 524288  // 减小到 512KB
  }
}
```

### 问题 4: 图片压缩失败

**症状**: 压缩后图片损坏或无法显示

**解决方案**:
1. 检查图片格式是否支持
2. 调整压缩质量
3. 检查浏览器兼容性

```javascript
// 禁用自动压缩
const result = await fileapi.upload(file, {
  // 不压缩，直接上传
});

// 或手动控制压缩参数
const compressed = await fileapi.compressImage(file, {
  maxWidth: 4096,
  maxHeight: 4096,
  quality: 0.95  // 提高质量
});
```

### 问题 5: 下载文件名乱码

**症状**: 下载的文件名显示为乱码

**解决方案**:
服务端需要正确编码文件名

```javascript
// 服务端（Node.js）
const filename = encodeURIComponent('中文文件名.pdf');
res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${filename}`);
```

---

## 服务端示例

### Node.js (Express + Multer)

```javascript
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();

// 配置存储
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

// 简单上传
app.post('/upload', upload.single('file'), (req, res) => {
  res.json({
    success: true,
    fileId: req.file.filename,
    filename: req.file.originalname,
    size: req.file.size,
    url: `/download/${req.file.filename}`
  });
});

// 分片上传
const chunks = new Map();

app.post('/upload', upload.single('file'), (req, res) => {
  const { chunkIndex, totalChunks, fileId, fileName } = req.body;

  if (totalChunks) {
    // 分片上传
    if (!chunks.has(fileId)) {
      chunks.set(fileId, {
        fileName,
        totalChunks: parseInt(totalChunks),
        chunks: []
      });
    }

    const fileChunks = chunks.get(fileId);
    fileChunks.chunks[parseInt(chunkIndex)] = req.file.path;

    // 检查是否所有分片都已上传
    if (fileChunks.chunks.filter(Boolean).length === fileChunks.totalChunks) {
      // 合并分片
      const finalPath = `uploads/${fileId}${path.extname(fileName)}`;
      const writeStream = fs.createWriteStream(finalPath);

      for (const chunkPath of fileChunks.chunks) {
        const data = fs.readFileSync(chunkPath);
        writeStream.write(data);
        fs.unlinkSync(chunkPath); // 删除临时分片
      }

      writeStream.end();
      chunks.delete(fileId);

      res.json({
        success: true,
        fileId,
        filename: fileName,
        url: `/download/${fileId}${path.extname(fileName)}`
      });
    } else {
      res.json({ success: true, message: 'Chunk received' });
    }
  } else {
    // 普通上传
    res.json({
      success: true,
      fileId: req.file.filename,
      filename: req.file.originalname,
      url: `/download/${req.file.filename}`
    });
  }
});

// 下载文件
app.get('/download/:fileId', (req, res) => {
  const filePath = path.join(__dirname, 'uploads', req.params.fileId);
  
  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).send('File not found');
  }
});

app.listen(3000);
```

---

## 更新日志

### v1.0.0 (2025-11-02)
- ✅ 初始版本
- ✅ 文件验证（类型、大小、扩展名）
- ✅ 简单上传（小文件）
- ✅ 分片上传（大文件）
- ✅ 批量上传
- ✅ 图片自动压缩
- ✅ 进度监控
- ✅ 文件下载
- ✅ 文件预览
- ✅ Base64/Text/ArrayBuffer 读取

---

**开发者**: King, Rainbow Haruko
