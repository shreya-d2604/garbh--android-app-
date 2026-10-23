import { runtime } from '../_shared/runtime.ts';
import { handleProcessReport } from './handler.ts';

Deno.serve((req) => handleProcessReport(req, runtime()));
