import { requestOwner, json, failure, publicTask } from '../../../../../modules/ocr/http.mjs';
import { getTask, retryTask } from '../../../../../modules/ocr/store.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request, { params }) {
  try { return json({ task: publicTask(await getTask((await params).id, await requestOwner(request))) }); }
  catch (error) { return failure(error); }
}
export async function POST(request, { params }) {
  try { return json({ task: publicTask(await retryTask((await params).id, await requestOwner(request, true))) }); }
  catch (error) { return failure(error); }
}
