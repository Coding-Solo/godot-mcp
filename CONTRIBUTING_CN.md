# 为 Godot MCP 做贡献

感谢您考虑为 Godot MCP 做贡献！本文档概述了为项目做贡献的流程。

## 行为准则

通过参与本项目，您同意为每个人保持尊重和包容的环境。

## 我可以如何贡献？

### 报告错误

- 检查错误是否已在问题部分报告
- 如果可用，使用错误报告模板
- 包含重现错误的详细步骤
- 包含任何相关的日志或截图
- 指定您的环境（操作系统、Godot 版本等）

### 建议增强功能

- 检查增强功能是否已在问题部分建议
- 如果可用，使用功能请求模板
- 清楚地描述增强功能及其好处
- 考虑增强功能如何适应项目范围

### 拉取请求

1. Fork 仓库
2. 为您的功能或错误修复创建一个新分支（`git checkout -b feature/amazing-feature`）
3. 进行更改
4. 如果有可用测试，请运行测试
5. 使用清晰的提交消息提交您的更改
6. 推送到您的分支（`git push origin feature/amazing-feature`）
7. 打开一个拉取请求

## 开发流程

### 设置开发环境

1. 克隆仓库
2. 使用 `npm install` 安装依赖项
3. 使用 `npm run build` 构建项目
4. 对于自动重新构建的开发，使用 `npm run watch`

### 项目结构

```
godot-mcp/
├── src/             # 源代码
│   └── index.ts     # 主服务器实现
├── build/           # 编译的 JavaScript（生成的）
├── tests/           # 测试文件（未来）
├── examples/        # 示例 Godot 项目（未来）
├── LICENSE          # MIT 许可证
├── README.md        # 文档
├── CONTRIBUTING.md  # 贡献指南
├── package.json     # 项目配置
└── tsconfig.json    # TypeScript 配置
```

### 代码风格

- 遵循项目中现有的代码风格
- 使用 TypeScript 以确保类型安全
- 为所有函数和类包含 JSDoc 注释
- 编写清晰和描述性的变量和函数名称
- 为复杂对象使用有意义的接口
- 使用详细的错误消息优雅地处理错误

### 调试

要调试 MCP 服务器：

1. 将 `DEBUG` 环境变量设置为 `true`
2. 使用 MCP Inspector 进行交互式调试：
   ```bash
   npm run inspector
   ```
3. 检查日志以获取有关正在发生的事情的详细信息

### 添加新工具

向 MCP 服务器添加新工具时：

1. 在 `setupToolHandlers` 方法定义工具
2. 为工具创建处理程序方法
3. 添加适当的输入验证和错误处理
4. 使用新工具的文档更新 README.md
5. 更新 README.md 中的功能部分
6. 更新配置示例中的 autoApprove 部分
7. 为新功能添加测试

#### 最近添加的工具

最近添加了以下工具：

- **get_project_info**：检索有关 Godot 项目的元数据
  - 分析项目结构
  - 返回有关场景、脚本和资源的信息
  - 帮助 LLM 理解 Godot 项目的组织
  
- **capture_screenshot**：截取正在运行的 Godot 项目的屏幕截图
  - 需要活动的 Godot 进程
  - 将屏幕截图保存到指定路径
  - 对于视觉调试和反馈很有用

示例：

```typescript
// 在 setupToolHandlers 中
{
  name: 'your_new_tool',
  description: '描述您的工具做什么',
  inputSchema: {
    type: 'object',
    properties: {
      param1: {
        type: 'string',
        description: '参数 1 的描述',
      },
    },
    required: ['param1'],
  },
}

// 添加处理程序方法
private async handleYourNewTool(args: any) {
  // 验证输入
  if (!args.param1) {
    return this.createErrorResponse(
      '参数 1 是必需的',
      ['为参数 1 提供有效值']
    );
  }

  try {
    // 实现工具功能
    // ...

    return {
      content: [
        {
          type: 'text',
          text: '您的工具的结果',
        },
      ],
    };
  } catch (error: any) {
    return this.createErrorResponse(
      `执行工具失败：${error?.message || '未知错误'}`,
      [
        '可能的解决方案 1',
        '可能的解决方案 2'
      ]
    );
  }
}
```

### 跨平台兼容性

进行更改时，确保它们在不同平台上工作：

- 使用 Node.js 的路径工具（`path.join` 等）而不是硬编码的路径分隔符
- 如果可能，在不同操作系统上测试
- 考虑不同的 Godot 安装位置
- 使用环境变量进行配置

## 测试

- 尽可能为新功能添加测试
- 在提交拉取请求之前确保所有测试通过
- 如果可能，在不同平台上测试
- 使用不同版本的 Godot 进行测试

## 文档

- 使用新功能保持 README.md 更新
- 记录所有工具及其参数
- 为新功能包含示例
- 使用常见问题更新故障排除部分

## 有问题？

如果您对贡献有任何疑问，请随时打开一个问题进行讨论。

感谢您的贡献！
