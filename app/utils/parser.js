/**
 * Robust episode filename parser with selectable naming patterns
 * Supports: auto, [EP-x], EPx, ep-x, SxxExx, x (bare number)
 */

// Available naming patterns for the UI
export const NAMING_PATTERNS = [
  { id: 'auto',       label: 'Auto Detect',         example: 'Tries all patterns automatically' },
  { id: 'bracket',    label: '[EP-x] / [EP_x]',     example: '[EP-366] Bleach [Dual].mkv' },
  { id: 'ep_dash',    label: 'EP-x / ep-x',         example: 'Bleach EP-12 [720p].mkv' },
  { id: 'ep_bare',    label: 'EPx / epx',            example: 'Bleach EP12 [720p].mkv' },
  { id: 'sxxexx',     label: 'S01E04 / s1e04',       example: 'Breaking.Bad.S01E04.720p.mkv' },
  { id: 'bare',       label: 'x (bare number)',       example: 'Bleach - 366 [720p].mkv' },
  { id: 'episode',    label: 'Episode x',            example: 'Bleach Episode 12 [Dual].mkv' },
  { id: 'anything',   label: 'Anything',            example: 'List all files as random/ordered' },
];

/**
 * Normalize pattern ID to internal canonical key
 */
function normalizePatternId(patternId) {
  if (!patternId) return 'auto';
  const p = String(patternId).toLowerCase().trim();
  if (p === 's01e01' || p === 'sxxexx') return 'sxxexx';
  if (p === 'episode 01' || p === 'episode') return 'episode';
  if (p === '01 - title' || p === 'numeric' || p === 'bare') return 'bare';
  if (p === 'auto') return 'auto';
  return p;
}

/**
 * Extract episode number using a specific pattern
 */
function extractByPattern(fileName = '', patternId = 'auto') {
  const safeName = String(fileName || '');
  const pId = normalizePatternId(patternId);

  if (pId === 'anything') return null;
  switch (pId) {
    case 'bracket': {
      const m = safeName.match(/\[[Ee][Pp][-_]?(\d+)\]/);
      return m ? parseInt(m[1], 10) : null;
    }
    case 'ep_dash': {
      const m = safeName.match(/(?:^|[^[\w])[Ee][Pp][-_](\d+)(?:\b|[_\]\s.])/);
      return m ? parseInt(m[1], 10) : null;
    }
    case 'ep_bare': {
      const m = safeName.match(/(?:^|[^[\w])[Ee][Pp](\d+)(?:\b|[_\]\s.])/);
      return m ? parseInt(m[1], 10) : null;
    }
    case 'sxxexx': {
      const m = safeName.match(/[Ss](\d{1,2})[Ee](\d{2,4})/);
      return m ? parseInt(m[2], 10) : null;
    }
    case 'bare': {
      const noBrackets = safeName.replace(/\[[^\]]+\]/g, '');
      const noExt = noBrackets.replace(/\.[a-zA-Z0-9]+$/, '');
      const m = noExt.match(/(?:^|[\s\-_.])\s*(\d+)\s*(?:[\s\-_.]|$)/);
      return m ? parseInt(m[1], 10) : null;
    }
    case 'episode': {
      const m = safeName.match(/[Ee][Pp][Ii][Ss][Oo][Dd][Ee]\s*[-_]?\s*(\d+)/);
      return m ? parseInt(m[1], 10) : null;
    }
    default:
      return extractAuto(safeName);
  }
}

/**
 * Auto-detect: try all patterns in priority order
 */
function extractAuto(fileName = '') {
  const safeName = String(fileName || '');
  const order = ['bracket', 'sxxexx', 'ep_dash', 'ep_bare', 'episode', 'bare'];
  for (const pid of order) {
    const num = extractByPattern(safeName, pid);
    if (num !== null) return num;
  }
  return null;
}

export function parseEpisode(fileName = '', index = 0, patternId = 'auto') {
  const safeName = String(fileName || '');
  const pId = normalizePatternId(patternId);

  if (pId === 'anything') {
    return {
      episodeNumber: index + 1,
      animeTitle: safeName.replace(/\.[a-zA-Z0-9]+$/, '').trim(),
      fileName: safeName
    };
  }

  let episodeNumber = null;

  if (pId === 'auto') {
    episodeNumber = extractAuto(safeName);
  } else {
    episodeNumber = extractByPattern(safeName, pId);
  }

  if (episodeNumber === null) {
    episodeNumber = index + 1;
  }

  // --- Extract Anime Title ---
  let cleaned = safeName.replace(/\[[Ee][Pp][-_]?(\d+)\]/, '');
  cleaned = cleaned.replace(/\[[^\]]+\]/g, '');
  cleaned = cleaned.replace(/[Ss]\d{1,2}[Ee]\d{1,4}/g, '');
  
  if (episodeNumber !== null) {
    const epNumPattern = new RegExp(`(?:\\b|_)(?:[Ee][Pp][Ii][Ss][Oo][Dd][Ee]|[Ee][Pp])?\\s*[-_]?\\s*${episodeNumber}(?:\\b|_)`, 'g');
    cleaned = cleaned.replace(epNumPattern, ' ');
  }

  cleaned = cleaned.replace(/\.[a-zA-Z0-9]+$/, '');
  cleaned = cleaned.replace(/@\w+/g, '');
  cleaned = cleaned.replace(/-\s*Dual\s*Audio/gi, '');
  cleaned = cleaned.replace(/_|-/g, ' ');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  if (!cleaned) {
    cleaned = safeName.replace(/\.[a-zA-Z0-9]+$/, '').trim();
  }

  return {
    episodeNumber,
    animeTitle: cleaned,
    fileName: safeName
  };
}

/**
 * Sorts an array of episodes numerically by episodeNumber, placing off-pattern files at the top
 */
export function sortEpisodes(episodes = []) {
  if (!Array.isArray(episodes)) return [];
  return [...episodes].sort((a, b) => {
    const aOff = !!a?.isOffPattern;
    const bOff = !!b?.isOffPattern;

    if (aOff && !bOff) return -1;
    if (!aOff && bOff) return 1;
    if (aOff && bOff) {
      const aName = String(a?.fileName || '');
      const bName = String(b?.fileName || '');
      return aName.localeCompare(bName, undefined, { numeric: true, sensitivity: 'base' });
    }
    const aNum = Number(a?.episodeNumber || 0);
    const bNum = Number(b?.episodeNumber || 0);
    return aNum - bNum;
  });
}

export const getSubfolder = (filePath, rootPath) => {
  if (!filePath || !rootPath) return '';
  const normFile = String(filePath).replace(/\\/g, '/');
  const normRoot = String(rootPath).replace(/\\/g, '/');
  if (normFile.startsWith(normRoot)) {
    const rel = normFile.slice(normRoot.length).replace(/^\//, '');
    const parts = rel.split('/');
    if (parts.length > 1) {
      return parts[0];
    }
  }
  return '';
};

export const getRelativePath = (filePath, rootPath) => {
  if (!filePath) return '';
  const normFile = String(filePath).replace(/\\/g, '/');
  const normRoot = rootPath ? String(rootPath).replace(/\\/g, '/') : '';
  let rel = normFile;
  if (normFile.startsWith(normRoot)) {
    rel = normFile.slice(normRoot.length).replace(/^\//, '');
  }
  return rel;
};

export const getSafeDocId = (filePath, rootPath) => {
  if (!filePath) return 'ep_' + Math.random().toString(36).substr(2, 9);
  const rel = getRelativePath(filePath, rootPath);
  return 'ep_' + String(rel).replace(/[^a-zA-Z0-9]/g, '_');
};

export function processScannedFiles(scanResult = [], rootPath = '', namingPattern = 'auto') {
  if (!Array.isArray(scanResult)) return [];
  
  // Group files by subfolder
  const groups = {};
  scanResult.forEach(ep => {
    if (!ep) return;
    const pathVal = ep.path || ep.filePath || ep.name || '';
    const folder = getSubfolder(pathVal, rootPath);
    if (!groups[folder]) {
      groups[folder] = [];
    }
    groups[folder].push(ep);
  });

  const allProcessed = [];

  // For each folder group, separate and process
  Object.keys(groups).forEach(folder => {
    const files = groups[folder];

    const offPatternFiles = [];
    const patternedFiles = [];

    files.forEach(file => {
      if (!file) return;
      const fileName = String(file.name || file.fileName || '');
      let isOff = false;
      if (normalizePatternId(namingPattern) !== 'anything') {
        const num = (normalizePatternId(namingPattern) === 'auto')
          ? extractAuto(fileName)
          : extractByPattern(fileName, namingPattern);
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

    offPatternFiles.sort((a, b) => String(a.name || a.fileName || '').localeCompare(String(b.name || b.fileName || ''), undefined, { numeric: true, sensitivity: 'base' }));
    patternedFiles.sort((a, b) => String(a.name || a.fileName || '').localeCompare(String(b.name || b.fileName || ''), undefined, { numeric: true, sensitivity: 'base' }));

    const combinedFiles = [...offPatternFiles, ...patternedFiles];

    combinedFiles.forEach((ep, folderIdx) => {
      const fileName = String(ep.name || ep.fileName || '');
      const filePath = String(ep.path || ep.filePath || '');
      const isOff = offPatternFiles.includes(ep);
      const parsed = parseEpisode(fileName, folderIdx, namingPattern);
      allProcessed.push({
        episodeNumber: parsed.episodeNumber,
        fileName: fileName,
        filePath: filePath,
        createdAt: ep.createdAt || Date.now(),
        docId: getSafeDocId(filePath, rootPath),
        isOffPattern: isOff
      });
    });
  });

  return allProcessed;
}
