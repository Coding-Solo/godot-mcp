/**
 * Internationalization (i18n) module for Godot MCP Server
 * Supports multiple languages for error messages and UI text
 */

/**
 * Supported languages
 */
export type Language = 'en' | 'zh-CN' | 'zh-TW' | 'ja' | 'ko' | 'ru' | 'fr' | 'de' | 'es' | 'pt';

/**
 * Message categories
 */
export type MessageCategory = 'errors' | 'warnings' | 'info' | 'tools' | 'descriptions';

/**
 * Translation messages structure
 */
interface Messages {
  errors: Record<string, string>;
  warnings: Record<string, string>;
  info: Record<string, string>;
  tools: Record<string, string>;
  descriptions: Record<string, string>;
}

/**
 * English messages (default)
 */
const enMessages: Messages = {
  errors: {
    project_path_required: 'Project path is required',
    invalid_project_path: 'Invalid project path',
    not_godot_project: 'Not a valid Godot project: {path}',
    godot_not_found: 'Could not find a valid Godot executable path',
    no_active_processes: 'No active Godot processes',
    instance_not_found: 'No process found with instanceId: {id}',
    instance_not_running: 'Instance {id} is not running',
    instance_already_running: 'Instance ID "{id}" is already in use by a running process',
    screenshot_not_enabled: 'Instance {id} does not have screenshot support enabled',
    screenshot_timeout: 'Screenshot capture timed out',
    scene_not_found: 'Scene not found: {path}',
    node_not_found: 'Node not found: {path}',
    script_not_found: 'Script not found: {path}',
    resource_not_found: 'Resource not found: {path}',
    invalid_path: 'Invalid path: {path}',
    file_write_error: 'Failed to write file: {path}',
    file_read_error: 'Failed to read file: {path}',
    operation_failed: 'Operation failed: {operation}',
    signal_not_found: 'Signal not found: {signal}',
    group_not_found: 'Group not found: {group}',
  },
  warnings: {
    process_cleanup: 'Cleaning up exited process {id} to allow ID reuse',
    screenshot_disabled: 'Could not determine main scene, screenshot disabled for instance {id}',
    deprecated_tool: 'Tool {tool} is deprecated, use {replacement} instead',
  },
  info: {
    server_started: 'Godot MCP Server started',
    process_started: 'Godot project started with instanceId: {id}',
    process_stopped: 'Godot project instance "{id}" stopped',
    screenshot_captured: 'Screenshot captured for instance {id}',
    scene_created: 'Scene created: {path}',
    node_added: 'Node added: {name}',
    signal_connected: 'Signal {signal} connected',
    group_added: 'Node added to group: {group}',
  },
  tools: {
    launch_editor: 'Launch Godot editor for a specific project',
    run_project: 'Run the Godot project and capture output',
    get_debug_output: 'Get the current debug output and errors',
    stop_project: 'Stop running Godot project instance(s)',
    capture_screenshot: 'Capture a screenshot from a running Godot project instance',
    get_godot_version: 'Get the installed Godot version',
    list_projects: 'List Godot projects in a directory',
    get_project_info: 'Retrieve metadata about a Godot project',
    create_scene: 'Create a new scene',
    add_node: 'Add a new node to a scene',
    load_sprite: 'Load a sprite into a Sprite2D node',
    save_scene: 'Save a scene',
    signal_connect: 'Connect a signal from one node to another',
    signal_disconnect: 'Disconnect a signal connection',
    group_add: 'Add a node to a group',
    group_remove: 'Remove a node from a group',
    list_groups: 'List all groups in a scene',
  },
  descriptions: {
    projectPath: 'Path to the Godot project directory',
    scene: 'Optional: Specific scene to run',
    instanceId: 'Optional: Unique identifier for this instance',
    args: 'Optional: Additional command-line arguments',
    enableScreenshot: 'Optional: Enable screenshot capture for this instance',
    outputPath: 'Optional: Path to save the output',
    nodeName: 'Name of the node',
    nodeType: 'Type of the node to create',
    parentNodePath: 'Path to the parent node',
    signalName: 'Name of the signal to connect',
    sourceNode: 'Path to the source node (emitter)',
    targetNode: 'Path to the target node (receiver)',
    methodName: 'Name of the method to call when signal is emitted',
    groupName: 'Name of the group',
  },
};

/**
 * Simplified Chinese messages
 */
const zhCNMessages: Messages = {
  errors: {
    project_path_required: '项目路径是必需的',
    invalid_project_path: '无效的项目路径',
    not_godot_project: '不是有效的 Godot 项目: {path}',
    godot_not_found: '找不到有效的 Godot 可执行文件路径',
    no_active_processes: '没有活动的 Godot 进程',
    instance_not_found: '找不到实例 ID: {id}',
    instance_not_running: '实例 {id} 未运行',
    instance_already_running: '实例 ID "{id}" 已被运行中的进程使用',
    screenshot_not_enabled: '实例 {id} 未启用截图支持',
    screenshot_timeout: '截图捕获超时',
    scene_not_found: '找不到场景: {path}',
    node_not_found: '找不到节点: {path}',
    script_not_found: '找不到脚本: {path}',
    resource_not_found: '找不到资源: {path}',
    invalid_path: '无效路径: {path}',
    file_write_error: '写入文件失败: {path}',
    file_read_error: '读取文件失败: {path}',
    operation_failed: '操作失败: {operation}',
    signal_not_found: '找不到信号: {signal}',
    group_not_found: '找不到分组: {group}',
  },
  warnings: {
    process_cleanup: '正在清理已退出的进程 {id} 以允许 ID 重用',
    screenshot_disabled: '无法确定主场景，实例 {id} 的截图功能已禁用',
    deprecated_tool: '工具 {tool} 已弃用，请使用 {replacement}',
  },
  info: {
    server_started: 'Godot MCP 服务器已启动',
    process_started: 'Godot 项目已启动，实例 ID: {id}',
    process_stopped: 'Godot 项目实例 "{id}" 已停止',
    screenshot_captured: '实例 {id} 截图已捕获',
    scene_created: '场景已创建: {path}',
    node_added: '节点已添加: {name}',
    signal_connected: '信号 {signal} 已连接',
    group_added: '节点已添加到分组: {group}',
  },
  tools: {
    launch_editor: '启动指定项目的 Godot 编辑器',
    run_project: '运行 Godot 项目并捕获输出',
    get_debug_output: '获取当前的调试输出和错误',
    stop_project: '停止运行中的 Godot 项目实例',
    capture_screenshot: '从运行中的 Godot 项目实例捕获截图',
    get_godot_version: '获取已安装的 Godot 版本',
    list_projects: '列出目录中的 Godot 项目',
    get_project_info: '获取 Godot 项目的元数据',
    create_scene: '创建新场景',
    add_node: '向场景添加新节点',
    load_sprite: '加载精灵到 Sprite2D 节点',
    save_scene: '保存场景',
    signal_connect: '将信号从一个节点连接到另一个节点',
    signal_disconnect: '断开信号连接',
    group_add: '将节点添加到分组',
    group_remove: '从分组中移除节点',
    list_groups: '列出场景中的所有分组',
  },
  descriptions: {
    projectPath: 'Godot 项目目录的路径',
    scene: '可选：要运行的特定场景',
    instanceId: '可选：此实例的唯一标识符',
    args: '可选：额外的命令行参数',
    enableScreenshot: '可选：为此实例启用截图捕获',
    outputPath: '可选：保存输出的路径',
    nodeName: '节点名称',
    nodeType: '要创建的节点类型',
    parentNodePath: '父节点的路径',
    signalName: '要连接的信号名称',
    sourceNode: '源节点（发射器）的路径',
    targetNode: '目标节点（接收器）的路径',
    methodName: '信号发射时要调用的方法名称',
    groupName: '分组名称',
  },
};

/**
 * Traditional Chinese messages
 */
const zhTWMessages: Messages = {
  errors: {
    project_path_required: '專案路徑是必需的',
    invalid_project_path: '無效的專案路徑',
    not_godot_project: '不是有效的 Godot 專案: {path}',
    godot_not_found: '找不到有效的 Godot 可執行檔路徑',
    no_active_processes: '沒有活動的 Godot 进程',
    instance_not_found: '找不到實例 ID: {id}',
    instance_not_running: '實例 {id} 未運行',
    instance_already_running: '實例 ID "{id}" 已被運行中的进程使用',
    screenshot_not_enabled: '實例 {id} 未啟用截圖支援',
    screenshot_timeout: '截圖捕獲超時',
    scene_not_found: '找不到場景: {path}',
    node_not_found: '找不到節點: {path}',
    script_not_found: '找不到腳本: {path}',
    resource_not_found: '找不到資源: {path}',
    invalid_path: '無效路徑: {path}',
    file_write_error: '寫入檔案失敗: {path}',
    file_read_error: '讀取檔案失敗: {path}',
    operation_failed: '操作失敗: {operation}',
    signal_not_found: '找不到訊號: {signal}',
    group_not_found: '找不到群組: {group}',
  },
  warnings: {
    process_cleanup: '正在清理已退出的进程 {id} 以允許 ID 重用',
    screenshot_disabled: '無法確定主場景，實例 {id} 的截圖功能已禁用',
    deprecated_tool: '工具 {tool} 已棄用，請使用 {replacement}',
  },
  info: {
    server_started: 'Godot MCP 伺服器已啟動',
    process_started: 'Godot 專案已啟動，實例 ID: {id}',
    process_stopped: 'Godot 專案實例 "{id}" 已停止',
    screenshot_captured: '實例 {id} 截圖已捕獲',
    scene_created: '場景已創建: {path}',
    node_added: '節點已添加: {name}',
    signal_connected: '訊號 {signal} 已連接',
    group_added: '節點已添加到群組: {group}',
  },
  tools: {
    launch_editor: '啟動指定專案的 Godot 編輯器',
    run_project: '運行 Godot 專案並捕獲輸出',
    get_debug_output: '獲取當前的除錯輸出和錯誤',
    stop_project: '停止運行中的 Godot 專案實例',
    capture_screenshot: '從運行中的 Godot 專案實例捕獲截圖',
    get_godot_version: '獲取已安裝的 Godot 版本',
    list_projects: '列出目錄中的 Godot 專案',
    get_project_info: '獲取 Godot 專案的元數據',
    create_scene: '創建新場景',
    add_node: '向場景添加新節點',
    load_sprite: '載入精靈到 Sprite2D 節點',
    save_scene: '儲存場景',
    signal_connect: '將訊號從一個節點連接到另一個節點',
    signal_disconnect: '斷開訊號連接',
    group_add: '將節點添加到群組',
    group_remove: '從群組中移除節點',
    list_groups: '列出場景中的所有群組',
  },
  descriptions: {
    projectPath: 'Godot 專案目錄的路徑',
    scene: '可選：要運行的特定場景',
    instanceId: '可選：此實例的唯一識別碼',
    args: '可選：額外的命令列參數',
    enableScreenshot: '可選：為此實例啟用截圖捕獲',
    outputPath: '可選：儲存輸出的路徑',
    nodeName: '節點名稱',
    nodeType: '要創建的節點類型',
    parentNodePath: '父節點的路徑',
    signalName: '要連接的訊號名稱',
    sourceNode: '源節點（發射器）的路徑',
    targetNode: '目標節點（接收器）的路徑',
    methodName: '訊號發射時要調用的方法名稱',
    groupName: '群組名稱',
  },
};

/**
 * Japanese messages
 */
const jaMessages: Messages = {
  errors: {
    project_path_required: 'プロジェクトパスが必要です',
    invalid_project_path: '無効なプロジェクトパス',
    not_godot_project: '有効なGodotプロジェクトではありません: {path}',
    godot_not_found: '有効なGodot実行ファイルパスが見つかりません',
    no_active_processes: 'アクティブなGodotプロセスがありません',
    instance_not_found: 'インスタンスIDが見つかりません: {id}',
    instance_not_running: 'インスタンス {id} は実行されていません',
    instance_already_running: 'インスタンスID "{id}" は既に実行中のプロセスで使用されています',
    screenshot_not_enabled: 'インスタンス {id} はスクリーンショットサポートが有効になっていません',
    screenshot_timeout: 'スクリーンショットのキャプチャがタイムアウトしました',
    scene_not_found: 'シーンが見つかりません: {path}',
    node_not_found: 'ノードが見つかりません: {path}',
    script_not_found: 'スクリプトが見つかりません: {path}',
    resource_not_found: 'リソースが見つかりません: {path}',
    invalid_path: '無効なパス: {path}',
    file_write_error: 'ファイルの書き込みに失敗しました: {path}',
    file_read_error: 'ファイルの読み込みに失敗しました: {path}',
    operation_failed: '操作に失敗しました: {operation}',
    signal_not_found: 'シグナルが見つかりません: {signal}',
    group_not_found: 'グループが見つかりません: {group}',
  },
  warnings: {
    process_cleanup: '終了したプロセス {id} をクリーンアップしてIDの再利用を許可しています',
    screenshot_disabled: 'メインシーンを特定できません。インスタンス {id} のスクリーンショットは無効です',
    deprecated_tool: 'ツール {tool} は非推奨です。{replacement} を使用してください',
  },
  info: {
    server_started: 'Godot MCPサーバーが起動しました',
    process_started: 'Godotプロジェクトが起動しました。インスタンスID: {id}',
    process_stopped: 'Godotプロジェクトインスタンス "{id}" が停止しました',
    screenshot_captured: 'インスタンス {id} のスクリーンショットをキャプチャしました',
    scene_created: 'シーンを作成しました: {path}',
    node_added: 'ノードを追加しました: {name}',
    signal_connected: 'シグナル {signal} を接続しました',
    group_added: 'ノードをグループに追加しました: {group}',
  },
  tools: {
    launch_editor: '特定のプロジェクトのGodotエディタを起動',
    run_project: 'Godotプロジェクトを実行して出力をキャプチャ',
    get_debug_output: '現在のデバッグ出力とエラーを取得',
    stop_project: '実行中のGodotプロジェクトインスタンスを停止',
    capture_screenshot: '実行中のGodotプロジェクトインスタンスからスクリーンショットをキャプチャ',
    get_godot_version: 'インストールされているGodotバージョンを取得',
    list_projects: 'ディレクトリ内のGodotプロジェクトを一覧表示',
    get_project_info: 'Godotプロジェクトのメタデータを取得',
    create_scene: '新しいシーンを作成',
    add_node: 'シーンに新しいノードを追加',
    load_sprite: 'Sprite2Dノードにスプライトをロード',
    save_scene: 'シーンを保存',
    signal_connect: 'シグナルをあるノードから別のノードに接続',
    signal_disconnect: 'シグナル接続を切断',
    group_add: 'ノードをグループに追加',
    group_remove: 'グループからノードを削除',
    list_groups: 'シーン内のすべてのグループを一覧表示',
  },
  descriptions: {
    projectPath: 'Godotプロジェクトディレクトリへのパス',
    scene: 'オプション：実行する特定のシーン',
    instanceId: 'オプション：このインスタンスの一意の識別子',
    args: 'オプション：追加のコマンドライン引数',
    enableScreenshot: 'オプション：このインスタンスのスクリーンショットキャプチャを有効にする',
    outputPath: 'オプション：出力を保存するパス',
    nodeName: 'ノード名',
    nodeType: '作成するノードのタイプ',
    parentNodePath: '親ノードへのパス',
    signalName: '接続するシグナル名',
    sourceNode: 'ソースノード（エミッター）へのパス',
    targetNode: 'ターゲットノード（レシーバー）へのパス',
    methodName: 'シグナル発信時に呼び出すメソッド名',
    groupName: 'グループ名',
  },
};

/**
 * All translations
 */
const translations: Record<Language, Messages> = {
  'en': enMessages,
  'zh-CN': zhCNMessages,
  'zh-TW': zhTWMessages,
  'ja': jaMessages,
  'ko': enMessages, // Fallback to English
  'ru': enMessages, // Fallback to English
  'fr': enMessages, // Fallback to English
  'de': enMessages, // Fallback to English
  'es': enMessages, // Fallback to English
  'pt': enMessages, // Fallback to English
};

/**
 * I18n class for handling translations
 */
export class I18n {
  private language: Language;
  private messages: Messages;

  constructor(language: Language = 'en') {
    this.language = language;
    this.messages = translations[language] || translations['en'];
  }

  /**
   * Set the current language
   */
  setLanguage(language: Language): void {
    this.language = language;
    this.messages = translations[language] || translations['en'];
  }

  /**
   * Get the current language
   */
  getLanguage(): Language {
    return this.language;
  }

  /**
   * Get a message from a category with parameter substitution
   */
  private getMessage(category: MessageCategory, key: string, params?: Record<string, string>): string {
    const messages = this.messages[category] as Record<string, string>;
    let message = messages[key] || translations['en'][category][key] || key;
    
    if (params) {
      for (const [param, value] of Object.entries(params)) {
        message = message.replace(new RegExp(`\\{${param}\\}`, 'g'), value);
      }
    }
    
    return message;
  }

  /**
   * Get an error message
   */
  error(key: string, params?: Record<string, string>): string {
    return this.getMessage('errors', key, params);
  }

  /**
   * Get a warning message
   */
  warning(key: string, params?: Record<string, string>): string {
    return this.getMessage('warnings', key, params);
  }

  /**
   * Get an info message
   */
  info(key: string, params?: Record<string, string>): string {
    return this.getMessage('info', key, params);
  }

  /**
   * Get a tool name/description
   */
  tool(key: string): string {
    return this.getMessage('tools', key);
  }

  /**
   * Get a parameter description
   */
  description(key: string): string {
    return this.getMessage('descriptions', key);
  }

  /**
   * Detect system language
   */
  static detectSystemLanguage(): Language {
    const envLang = process.env.LANG || process.env.LC_ALL || process.env.LC_MESSAGES || '';
    const locale = envLang.split('.')[0].replace('_', '-');
    
    // Map common locale codes
    const localeMap: Record<string, Language> = {
      'en': 'en',
      'en-US': 'en',
      'en-GB': 'en',
      'zh': 'zh-CN',
      'zh-CN': 'zh-CN',
      'zh-Hans': 'zh-CN',
      'zh-Hans-CN': 'zh-CN',
      'zh-TW': 'zh-TW',
      'zh-Hant': 'zh-TW',
      'zh-Hant-TW': 'zh-TW',
      'ja': 'ja',
      'ja-JP': 'ja',
      'ko': 'ko',
      'ko-KR': 'ko',
      'ru': 'ru',
      'ru-RU': 'ru',
      'fr': 'fr',
      'fr-FR': 'fr',
      'de': 'de',
      'de-DE': 'de',
      'es': 'es',
      'es-ES': 'es',
      'pt': 'pt',
      'pt-BR': 'pt',
    };

    return localeMap[locale] || 'en';
  }
}

/**
 * Global i18n instance
 */
export const i18n = new I18n(I18n.detectSystemLanguage());

/**
 * Initialize i18n with environment variable
 */
export function initI18n(): void {
  const envLanguage = process.env.MCP_LANGUAGE as Language;
  if (envLanguage && translations[envLanguage]) {
    i18n.setLanguage(envLanguage);
  }
}
