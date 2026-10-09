import { GET as getHandler, POST as postHandler } from './[...path]/route';

export async function GET(request: Request) {
  return getHandler(request, { params: Promise.resolve({ path: ['info'] }) });
}

export async function POST(request: Request) {
  return postHandler(request, { params: Promise.resolve({ path: ['agent', 'default', 'run'] }) });
}
