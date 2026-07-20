import { readdirSync } from 'fs';
import { extname, join } from 'path';

export type ProjectFileType = 'scene' | 'script' | 'resource' | 'all';

export interface ListProjectFilesOptions {
  pattern?: string;
  type?: ProjectFileType;
}

export interface ProjectFilesResult {
  scenes: string[];
  scripts: string[];
  resources: string[];
  total: number;
}

type ProjectFileCategory = 'scenes' | 'scripts' | 'resources';

const SCENE_EXTENSIONS = new Set(['.tscn', '.scn']);
const SCRIPT_EXTENSIONS = new Set(['.gd', '.gdscript', '.cs']);
const RESOURCE_EXTENSIONS = new Set(['.tres', '.res', '.gdshader', '.shader']);

function normalizePattern(pattern: string): string {
  const normalized = pattern.replace(/\\/g, '/').replace(/^\.\//, '');
  const segments = normalized.split('/');

  if (
    normalized.startsWith('/')
    || /^[A-Za-z]:/.test(normalized)
    || segments.includes('..')
  ) {
    throw new Error('Pattern must be relative to the project and cannot contain ".."');
  }

  return normalized;
}

function globToRegExp(pattern: string): RegExp {
  let expression = '^';

  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];

    if (character === '*') {
      if (pattern[index + 1] === '*') {
        if (pattern[index + 2] === '/') {
          expression += '(?:.*/)?';
          index += 2;
        } else {
          expression += '.*';
          index += 1;
        }
      } else {
        expression += '[^/]*';
      }
    } else if (character === '?') {
      expression += '[^/]';
    } else if ('\\^$+?.()|{}[]'.includes(character)) {
      expression += `\\${character}`;
    } else {
      expression += character;
    }
  }

  return new RegExp(`${expression}$`);
}

function getFileCategory(filename: string): ProjectFileCategory | null {
  const extension = extname(filename).toLowerCase();

  if (SCENE_EXTENSIONS.has(extension)) {
    return 'scenes';
  }

  if (SCRIPT_EXTENSIONS.has(extension)) {
    return 'scripts';
  }

  if (RESOURCE_EXTENSIONS.has(extension)) {
    return 'resources';
  }

  return null;
}

export function listProjectFiles(
  projectPath: string,
  options: ListProjectFilesOptions = {}
): ProjectFilesResult {
  const result: ProjectFilesResult = {
    scenes: [],
    scripts: [],
    resources: [],
    total: 0,
  };
  const selectedType = options.type ?? 'all';
  const normalizedPattern = options.pattern ? normalizePattern(options.pattern) : undefined;
  const patternMatcher = normalizedPattern ? globToRegExp(normalizedPattern) : undefined;

  const scanDirectory = (directoryPath: string, relativeDirectory = ''): void => {
    const entries = readdirSync(directoryPath, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) {
        continue;
      }

      const relativePath = relativeDirectory
        ? `${relativeDirectory}/${entry.name}`
        : entry.name;

      if (entry.isDirectory()) {
        scanDirectory(join(directoryPath, entry.name), relativePath);
        continue;
      }

      if (!entry.isFile() || (patternMatcher && !patternMatcher.test(relativePath))) {
        continue;
      }

      const category = getFileCategory(entry.name);
      if (!category) {
        continue;
      }

      if (selectedType !== 'all' && `${selectedType}s` !== category) {
        continue;
      }

      result[category].push(relativePath);
      result.total += 1;
    }
  };

  scanDirectory(projectPath);
  return result;
}
