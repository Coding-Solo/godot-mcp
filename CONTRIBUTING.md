# Contributing to Godot MCP

Thank you for considering contributing to Godot MCP! This document outlines the process for contributing to the project.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for everyone.

## How Can I Contribute?

### Reporting Bugs

- Check if the bug has already been reported in the Issues section
- Use the bug report template if available
- Include detailed steps to reproduce the bug
- Include any relevant logs or screenshots
- Specify your environment (OS, Godot version, etc.)

### Suggesting Enhancements

- Check if the enhancement has already been suggested in the Issues section
- Use the feature request template if available
- Clearly describe the enhancement and its benefits
- Consider how the enhancement fits into the project's scope

### Pull Requests

1. Fork the repository
2. Create a new branch for your feature or bugfix (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests if available
5. Commit your changes with clear commit messages
6. Push to your branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## Development Process

### Setting Up the Development Environment

1. Clone the repository
2. Install dependencies with `npm install`
3. Build the project with `npm run build`
4. For development with auto-rebuild, use `npm run watch`

### Project Structure

```
godot-mcp/
├── src/             # Source code
│   └── index.ts     # Main server implementation
├── build/           # Compiled JavaScript (generated)
├── tests/           # Test files (future)
├── examples/        # Example Godot projects (future)
├── LICENSE          # MIT License
├── README.md        # Documentation
├── CONTRIBUTING.md  # Contribution guidelines
├── package.json     # Project configuration
└── tsconfig.json    # TypeScript configuration
```

### Code Style

- Follow the existing code style in the project
- Use TypeScript for type safety
- Include JSDoc comments for all functions and classes
- Write clear and descriptive variable and function names
- Use meaningful interfaces for complex objects
- Handle errors gracefully with detailed error messages

### Debugging

For debugging the MCP server:

1. Set the `DEBUG` environment variable to `true`
2. Use the MCP Inspector for interactive debugging:
   ```bash
   npm run inspector
   ```
3. Check the logs for detailed information about what's happening

### Adding New Tools

When adding new tools to the MCP server:

1. Define the tool in the `setupToolHandlers` method
2. Create a handler method for the tool
3. Add proper input validation and error handling
4. Update the README.md with documentation for the new tool
5. Update the Features section in the README.md
6. Update the autoApprove section in the configuration examples
7. Add tests for the new functionality

#### Recently Added Tools

The following tools have been recently added:

- **get_project_info**: Retrieves metadata about a Godot project
  - Analyzes project structure
  - Returns information about scenes, scripts, and assets
  - Helps LLMs understand the organization of Godot projects
  
- **capture_screenshot**: Takes a screenshot of a running Godot project
  - Requires an active Godot process
  - Saves the screenshot to the specified path
  - Useful for visual debugging and feedback

Example:

```typescript
// In setupToolHandlers
{
  name: 'your_new_tool',
  description: 'Description of what your tool does',
  inputSchema: {
    type: 'object',
    properties: {
      param1: {
        type: 'string',
        description: 'Description of parameter 1',
      },
    },
    required: ['param1'],
  },
}

// Add handler method
private async handleYourNewTool(args: any) {
  // Validate input
  if (!args.param1) {
    return this.createErrorResponse(
      'Parameter 1 is required',
      ['Provide a valid value for parameter 1']
    );
  }

  try {
    // Implement tool functionality
    // ...

    return {
      content: [
        {
          type: 'text',
          text: 'Result of your tool',
        },
      ],
    };
  } catch (error: any) {
    return this.createErrorResponse(
      `Failed to execute tool: ${error?.message || 'Unknown error'}`,
      [
        'Possible solution 1',
        'Possible solution 2'
      ]
    );
  }
}
```

### Cross-Platform Compatibility

When making changes, ensure they work across different platforms:

- Use path utilities from Node.js (`path.join`, etc.) instead of hardcoded path separators
- Test on different operating systems if possible
- Consider different Godot installation locations
- Use environment variables for configuration

## Testing

- Add tests for new features when possible
- Ensure all tests pass before submitting a Pull Request
- Test on different platforms if possible
- Test with different Godot versions

## Documentation

- Keep README.md up to date with new features
- Document all tools and their parameters
- Include examples for new functionality
- Update the troubleshooting section with common issues

## Questions?

If you have any questions about contributing, feel free to open an issue for discussion.

Thank you for your contributions!
