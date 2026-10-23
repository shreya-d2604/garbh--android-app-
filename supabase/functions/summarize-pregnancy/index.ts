import { runtime } from '../_shared/runtime.ts';
import { handleSummarizePregnancy } from './handler.ts';

Deno.serve((req) => handleSummarizePregnancy(req, runtime()));
