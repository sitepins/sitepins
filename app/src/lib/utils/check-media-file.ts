// check media
export function checkMedia(filepath: string): boolean {
  if (typeof filepath !== "string") {
    return false;
  }

  // Convert the filename to lowercase to handle case-insensitive comparisons
  const lowercaseFilename: string = filepath.toLowerCase();

  // List of common media file extensions
  const mediaExtensions: string[] = [
    ".webp", // Images
    ".svg",
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".bmp",
    ".mp3", // Audio
    ".wav",
    ".flac",
    ".aac",
    ".mp4", // Video
    ".avi",
    ".mkv",
    ".mov",
    // Add more extensions as needed
  ];

  // Check if the lowercase filename ends with any of the media extensions
  for (const extension of mediaExtensions) {
    if (lowercaseFilename.endsWith(extension)) {
      return true; // It's a media file
    }
  }

  // If no match is found, it's not a media file
  return false;
}

// check if the file is a video
export function isVideo(filepath: string): boolean {
  if (typeof filepath !== "string") {
    return false;
  }

  const lowercaseFilename: string = filepath.toLowerCase();
  const videoExtensions: string[] = [".mp4", ".mov", ".mkv", ".webm", ".avi"];

  for (const extension of videoExtensions) {
    if (lowercaseFilename.endsWith(extension)) {
      return true;
    }
  }

  return false;
}

// check file
export function checkFile(filepath: string): boolean {
  if (typeof filepath !== "string") {
    return false;
  }
  if (filepath.match(/\.([^.]+)$/)) {
    return true;
  }
  return false;
}
