import { runtime } from '../_shared/runtime.ts';
import { handleSummarizeConsultation } from './handler.ts';

Deno.serve((req) => handleSummarizeConsultation(req, runtime()));
