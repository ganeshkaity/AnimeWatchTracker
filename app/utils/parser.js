/**
 * Robust episode filename parser with selectable naming patterns
 * Supports: auto, [EP-x], EPx, ep-x, SxxExx, x (bare number)
 */

// Available naming patterns for the UI
export const NAMING_PATTERNS = [
  { id: 'auto',    label: 'Auto Detect',         example: 'Tries all patterns automatically' },
  { id: 'bracket', label: '[EP-x] / [EP_x]',     example: '[EP-366] Bleach [Dual].mkv' },
  { id: 'ep_dash', label: 'EP-x / ep-x',         example: 'Bleach EP-12 [720p].mkv' },
  { id: 'ep_bare', label: 'EPx / epx',            example: 'Bleach EP12 [720p].mkv' },
  { id: 'sxxexx',  label: 'S01E04 / s1e04',       example: 'Breaking.Bad.S01E04.720p.mkv' },
  { id: 'bare',    label: 'x (bare number)',       example: 'Bleach - 366 [720p].mkv' },
  { id: 'episode', label: 'Episode x',            example: 'Bleach Episode 12 [Dual].mkv' },
  { id: 'anything', label: 'Anything',            example: 'List all files as random/ordered' },
];

/**
 * Extract episode number using a specific pattern
 */
function extractByPattern(fileName, patternId) {
  if (patternId === 'anything') return null;
  switch (patternId) {
    case 'bracket': {
      // [EP-xxx] or [EP_xxx] or [ep-xxx] or [EPxxx]
      const m = fileName.match(/\[[Ee][Pp][-_]?(\d+)\]/);
      return m ? parseInt(m[1], 10) : null;
    }
    case 'ep_dash': {
      // EP-x or ep-x (with dash/underscore, not inside brackets)
      const m = fileName.match(/(?:^|[^[\w])[Ee][Pp][-_](\d+)(?:\b|[_\]\s.])/);
      return m ? parseInt(m[1], 10) : null;
    }
    case 'ep_bare': {
      // EPx or epx (directly attached number, not inside brackets)
      const m = fileName.match(/(?:^|[^[\w])[Ee][Pp](\d+)(?:\b|[_\]\s.])/);
      return m ? parseInt(m[1], 10) : null;
    }
    case 'sxxexx': {
      // S01E04, s1e04, S1E4, etc.
      const m = fileName.match(/[Ss](\d{1,2})[Ee](\d{2,4})/); // Wait, S01E04, s1e04
      return m ? parseInt(m[2], 10) : null;
    }
    case 'bare': {
      // Standalone number: strip all bracket content, then find first number
      const noBrackets = fileName.replace(/\[[^\]]+\]/g, '');
      // Remove file extension first
      const noExt = noBrackets.replace(/\.[a-zA-Z0-9]+$/, '');
      // Find numbers separated by common delimiters (space, dash, underscore, dot)
      const m = noExt.match(/(?:^|[\s\-_.])\s*(\d+)\s*(?:[\s\-_.]|$)/);
      return m ? parseInt(m[1], 10) : null;
    }
    case 'episode': {
      // Episode x, episode x
      const m = fileName.match(/[Ee][Pp][Ii][Ss][Oo][Dd][Ee]\s*[-_]?\s*(\d+)/);
      return m ? parseInt(m[1], 10) : null;
    }
    default:
      return null;
  }
}

/**
 * Auto-detect: try all patterns in priority order
 */
function extractAuto(fileName) {
  // Priority: bracket > sxxexx > ep_dash > ep_bare > episode > bare
  const order = ['bracket', 'sxxexx', 'ep_dash', 'ep_bare', 'episode', 'bare'];
  for (const pid of order) {
    const num = extractByPattern(fileName, pid);
    if (num !== null) return num;
  }
  return null;
}

export function parseEpisode(fileName, index = 0, patternId = 'auto') {
  if (patternId === 'anything') {
    return {
      episodeNumber: index + 1,
      animeTitle: fileName.replace(/\.[a-zA-Z0-9]+$/, '').trim(),
      fileName: fileName
    };
  }

  let episodeNumber = null;

  if (patternId === 'auto') {
    episodeNumber = extractAuto(fileName);
  } else {
    episodeNumber = extractByPattern(fileName, patternId);
  }

  // Ultimate fallback: use file index
  if (episodeNumber === null) {
    episodeNumber = index + 1;
  }

  // --- Extract Anime Title ---
  // Strip the [EP-xxx] tag
  let cleaned = fileName.replace(/\[[Ee][Pp][-_]?(\d+)\]/, '');
  
  // Strip all other [...] brackets
  cleaned = cleaned.replace(/\[[^\]]+\]/g, '');
  
  // Strip SxxExx patterns
  cleaned = cleaned.replace(/[Ss]\d{1,2}[Ee]\d{1,4}/g, '');
  
  // Strip the parsed episode number and its common prefixes
  if (episodeNumber !== null) {
    const epNumPattern = new RegExp(`(?:\\b|_)(?:[Ee][Pp][Ii][Ss][Oo][Dd][Ee]|[Ee][Pp])?\\s*[-_]?\\s*${episodeNumber}(?:\\b|_)`, 'g');
    cleaned = cleaned.replace(epNumPattern, ' ');
  }

  // Strip file extension
  cleaned = cleaned.replace(/\.[a-zA-Z0-9]+$/, '');
  
  // Strip common internet tags
  cleaned = cleaned.replace(/@\w+/g, '');
  cleaned = cleaned.replace(/-\s*Dual\s*Audio/gi, '');
  cleaned = cleaned.replace(/_|-/g, ' ');
  
  // Normalize whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // If title ends up empty, fallback
  if (!cleaned) {
    cleaned = fileName.replace(/\.[a-zA-Z0-9]+$/, '').trim();
  }

  return {
    episodeNumber,
    animeTitle: cleaned,
    fileName: fileName
  };
}

/**
 * Sorts an array of episodes numerically by episodeNumber, placing off-pattern files at the top
 */
export function sortEpisodes(episodes) {
  return [...episodes].sort((a, b) => {
    const aOff = !!a.isOffPattern;
    const bOff = !!b.isOffPattern;

    if (aOff && !bOff) return -1;
    if (!aOff && bOff) return 1;
    if (aOff && bOff) {
      // Both are off-pattern, sort alphabetically by fileName
      return a.fileName.localeCompare(b.fileName, undefined, { numeric: true, sensitivity: 'base' });
    }
    // Both are patterned, sort numerically by episodeNumber
    return a.episodeNumber - b.episodeNumber;
  });
}

export const getSubfolder = (filePath, rootPath) => {
  if (!filePath || !rootPath) return '';
  const normFile = filePath.replace(/\\/g, '/');
  const normRoot = rootPath.replace(/\\/g, '/');
  if (normFile.startsWith(normRoot)) {
    const rel = normFile.slice(normRoot.length).replace(/^\//, '');
    const parts = rel.split('/');
    if (parts.length > 1) {
      return parts[0]; // Top-level subfolder
    }
  }
  return ''; // Root
};

export const getRelativePath = (filePath, rootPath) => {
  const normFile = filePath.replace(/\\/g, '/');
  const normRoot = rootPath.replace(/\\/g, '/');
  let rel = normFile;
  if (normFile.startsWith(normRoot)) {
    rel = normFile.slice(normRoot.length).replace(/^\//, '');
  }
  return rel;
};

export const getSafeDocId = (filePath, rootPath) => {
  const rel = getRelativePath(filePath, rootPath);
  return 'ep_' + rel.replace(/[^a-zA-Z0-9]/g, '_');
};

export function processScannedFiles(scanResult, rootPath, namingPattern) {
  // Group files by subfolder
  const groups = {};
  scanResult.forEach(ep => {
    const folder = getSubfolder(ep.path || ep.filePath, rootPath);
    if (!groups[folder]) {
      groups[folder] = [];
    }
    groups[folder].push(ep);
  });

  const allProcessed = [];

  // For each folder group, separate and process
  Object.keys(groups).forEach(folder => {
    const files = groups[folder];

    // Determine which are off-pattern and which are patterned
    const offPatternFiles = [];
    const patternedFiles = [];

    files.forEach(file => {
      let isOff = false;
      if (namingPattern !== 'anything') {
        const num = (namingPattern === 'auto')
          ? extractAuto(file.name)
          : extractByPattern(file.name, namingPattern);
        if (num === null) {
          isOff = true;
        }
      }
      if (isOff) {
        offPatternFiles.push(file);
      } else {
        patternedFiles.push(file);
      }
    });

    // Sort off-pattern files alphabetically by name
    offPatternFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    // Sort patterned files alphabetically by name first
    patternedFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    // Now concatenate them: off-pattern first, then patterned
    const combinedFiles = [...offPatternFiles, ...patternedFiles];

    combinedFiles.forEach((ep, folderIdx) => {
      const isOff = offPatternFiles.includes(ep);
      const parsed = parseEpisode(ep.name, folderIdx, namingPattern);
      allProcessed.push({
        episodeNumber: parsed.episodeNumber,
        fileName: ep.name,
        filePath: ep.path || ep.filePath,
        createdAt: ep.createdAt || Date.now(),
        docId: getSafeDocId(ep.path || ep.filePath, rootPath),
        isOffPattern: isOff
      });
    });
  });

  return allProcessed;
}
