import { api } from './api';

export type SourceType = 'youtube-playlist' | 'spotify-playlist' | 'local-folder';

export type LocalSource = {
  id: string;
  type: SourceType;
  value: string;
  backendSourceId?: string;
  importedCount?: number;
  ingestError?: string;
};

const providerKeyByType: Record<SourceType, string> = {
  'youtube-playlist': 'youtube_playlist',
  'spotify-playlist': 'spotify_playlist',
  'local-folder': 'local_files',
};

function buildSourceId(): string {
  return `src-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function addSource(params: {
  sourceType: SourceType;
  sourceValue: string;
  pendingLocalFileCount: number;
}): Promise<LocalSource> {
  const sourceValue = params.sourceValue.trim();
  if (!sourceValue) {
    throw new Error('Please enter a source value before adding.');
  }

  if (params.sourceType === 'local-folder') {
    if (params.pendingLocalFileCount < 1) {
      throw new Error('Please choose a local folder first.');
    }

    const registered = await api.registerLocalSource(sourceValue);
    const sourceState = registered.data.source;
    const indexed = await api.runLocalSourceIndex(sourceState.id);

    return {
      id: buildSourceId(),
      type: params.sourceType,
      value: sourceValue,
      backendSourceId: sourceState.id,
      importedCount: indexed.data.total_tracks,
    };
  }

  const registered = await api.registerSource(providerKeyByType[params.sourceType], sourceValue);
  const sourceState = registered.data.source;
  const synced = await api.runSourceSync(sourceState.id);
  const importedCount = Number(synced.data.total_tracks ?? 0);

  return {
    id: buildSourceId(),
    type: params.sourceType,
    value: sourceValue,
    backendSourceId: sourceState.id,
    importedCount,
  };
}

export async function cleanupBackendSources(sourceIds: string[]): Promise<void> {
  if (sourceIds.length < 1) {
    return;
  }

  await api.cleanupSources(sourceIds);
}

export function extractFolderSelection(filesInput: FileList | null): { folderName: string; fileCount: number } | null {
  const files = filesInput ? Array.from(filesInput) : [];
  if (files.length < 1) {
    return null;
  }

  const firstRelativePath = (files[0] as File & { webkitRelativePath?: string }).webkitRelativePath ?? '';
  const folderName = firstRelativePath.includes('/') ? firstRelativePath.split('/')[0] : files[0].name;

  return {
    folderName: folderName || 'selected-folder',
    fileCount: files.length,
  };
}

export async function pickLocalFolderName(windowRef: Window): Promise<string | null> {
  const windowWithDirectoryPicker = windowRef as Window & {
    showDirectoryPicker?: () => Promise<{ name: string }>;
  };

  if (!windowWithDirectoryPicker.showDirectoryPicker) {
    return null;
  }

  try {
    const handle = await windowWithDirectoryPicker.showDirectoryPicker();
    return handle.name;
  } catch {
    return null;
  }
}
