// Native file helpers for report upload: pick, compress, read. Kept apart from the pure logic
// (report-upload.ts) so that module stays testable without native modules.
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { newId } from './ids';
import { isAllowedMime, JPEG_QUALITY, resizeWidthFor, type PickedPage } from './report-upload';

function fromImageAsset(a: ImagePicker.ImagePickerAsset): PickedPage {
  return {
    key: newId(),
    uri: a.uri,
    mime: a.mimeType && isAllowedMime(a.mimeType) ? a.mimeType : 'image/jpeg',
    name: a.fileName ?? 'photo.jpg',
    size: a.fileSize ?? null,
    width: a.width,
  };
}

/** Choose photos from the gallery (several pages at once). Null when cancelled. */
export async function pickPhotos(): Promise<PickedPage[]> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    quality: 1,
  });
  return res.canceled ? [] : res.assets.map(fromImageAsset);
}

/** Take a photo of a page. Returns [] when cancelled or camera permission is refused. */
export async function takePhoto(): Promise<PickedPage[]> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return [];
  const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
  return res.canceled ? [] : res.assets.map(fromImageAsset);
}

export async function pickPdf(): Promise<PickedPage[]> {
  const res = await DocumentPicker.getDocumentAsync({
    type: 'application/pdf',
    multiple: false,
    copyToCacheDirectory: true,
  });
  if (res.canceled) return [];
  return res.assets.map((a) => ({
    key: newId(),
    uri: a.uri,
    mime: 'application/pdf',
    name: a.name,
    size: a.size ?? null,
  }));
}

/** Downscale and re-encode photos as JPEG; PDFs pass through untouched. */
export async function compressPage(page: PickedPage): Promise<PickedPage> {
  if (page.mime === 'application/pdf') return page;
  const width = resizeWidthFor(page.width);
  const context = ImageManipulator.ImageManipulator.manipulate(page.uri);
  if (width !== null) context.resize({ width });
  const image = await context.renderAsync();
  const result = await image.saveAsync({ compress: JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG });
  return { ...page, uri: result.uri, mime: 'image/jpeg', width: result.width, size: null };
}

export async function readBytes(uri: string): Promise<ArrayBuffer> {
  return await new File(uri).arrayBuffer();
}
