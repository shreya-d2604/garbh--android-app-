// Report upload (PLAN.md §7.4 #5, §8.2): validation, storage paths, compression, progress. Pure.
import { z } from 'zod';

import { isISODate } from '@/domain/pregnancy-math';

import type { ReportType } from './types';

export const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const;
export type ReportMime = (typeof ALLOWED_MIME)[number];

/** Bucket limit (migration 20261023001400). */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_PAGES = 20;
/** Photos wider than this are downscaled before upload (reports stay readable at 1600px). */
export const MAX_IMAGE_WIDTH = 1600;
export const JPEG_QUALITY = 0.7;

export const REPORT_TYPES: readonly ReportType[] = [
  'blood',
  'urine',
  'ultrasound',
  'nt_scan',
  'anomaly_scan',
  'growth_scan',
  'doppler',
  'gtt',
  'thyroid',
  'ecg',
  'other',
];

export interface PickedPage {
  key: string;
  uri: string;
  mime: string;
  name: string;
  /** Bytes, when known (document picker reports it; camera photos get it after compression). */
  size: number | null;
  width?: number | null;
}

export function isAllowedMime(mime: string): mime is ReportMime {
  return (ALLOWED_MIME as readonly string[]).includes(mime);
}

export function extForMime(mime: string): string {
  switch (mime) {
    case 'application/pdf':
      return 'pdf';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    default:
      return 'jpg';
  }
}

/** Storage object path: {patient_id}/{pregnancy_id}/{report_id}/{file_id}.{ext} (contracts §6). */
export function storagePath(p: {
  patientId: string;
  pregnancyId: string;
  reportId: string;
  fileId: string;
  mime: string;
}): string {
  return `${p.patientId}/${p.pregnancyId}/${p.reportId}/${p.fileId}.${extForMime(p.mime)}`;
}

/** i18n keys (namespace doctor) of problems with the chosen pages; empty = good to upload. */
export function validatePages(pages: readonly PickedPage[]): string[] {
  const issues: string[] = [];
  if (pages.length === 0) issues.push('report.errors.noFiles');
  if (pages.length > MAX_PAGES) issues.push('report.errors.tooManyPages');
  if (pages.some((p) => !isAllowedMime(p.mime))) issues.push('report.errors.badType');
  if (pages.some((p) => p.size != null && p.size > MAX_FILE_BYTES)) issues.push('report.errors.tooBig');
  return issues;
}

/** Target width for a photo, or null when it is small enough to upload as is. */
export function resizeWidthFor(width: number | null | undefined): number | null {
  return width != null && width > MAX_IMAGE_WIDTH ? MAX_IMAGE_WIDTH : null;
}

export function movePage<T>(items: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length || to < 0 || to >= items.length || from === to) return [...items];
  const next = [...items];
  const [moved] = next.splice(from, 1);
  if (moved !== undefined) next.splice(to, 0, moved);
  return next;
}

export interface FileProgress {
  size: number;
  /** Bytes confirmed uploaded for this file (size when finished, 0 before). */
  sent: number;
}

/** Overall upload progress 0..1, weighted by file size. */
export function overallProgress(files: readonly FileProgress[]): number {
  const total = files.reduce((n, f) => n + Math.max(f.size, 1), 0);
  if (total === 0) return 0;
  const sent = files.reduce((n, f) => n + Math.min(f.sent, Math.max(f.size, 1)), 0);
  return Math.min(1, sent / total);
}

export function progressPercent(files: readonly FileProgress[]): number {
  return Math.round(overallProgress(files) * 100);
}

/** Report details typed before uploading. */
export const reportMetaSchema = (today: string) =>
  z.object({
    type: z.enum(['blood', 'urine', 'ultrasound', 'nt_scan', 'anomaly_scan', 'growth_scan', 'doppler', 'gtt', 'thyroid', 'ecg', 'other']),
    title: z.string(),
    report_date: z.string().refine((v) => isISODate(v) && v <= today, { error: 'validation.date' }),
    lab_name: z.string(),
  });
export type ReportMetaValues = z.infer<ReturnType<typeof reportMetaSchema>>;
