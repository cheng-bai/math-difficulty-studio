import {currentUser} from '../../../lib/session.mjs';
export const dynamic='force-dynamic';
export async function GET(){
 if(!await currentUser())return new Response(null,{status:303,headers:{Location:'/login','Cache-Control':'private, no-store'}});
 return new Response('No legacy report has been configured. Use /national/试卷总览.html.',{status:404});
}
