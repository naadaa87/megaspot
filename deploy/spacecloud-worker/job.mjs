import { inspect,validatedEntry,ReviewRequired } from './guard.mjs';
import { verifyPublic } from './customer.mjs';

export async function runJob(job, host, check, verify=verifyPublic) {
  const entry=validatedEntry(job.entry);
  host.beforeWrite=check;
  let hasStartedWriting=false;
  try{
    await host.openHost(entry);
    const observed=inspect(await host.recordsFor(entry.date),entry);
    if(entry.action==='block'){
      if(observed.conflict)throw new ReviewRequired('conflict');
      if(!observed.own){
        await check();
        hasStartedWriting=true;
        await host.createSegment(entry);
      }
      const after=inspect(await host.recordsFor(entry.date),entry);
      if(!after.own||after.conflict)throw new ReviewRequired('unknown_result');
      await verify(host,entry);
    }else if(observed.own){
      await check();
      hasStartedWriting=true;
      await host.removeSegment(entry,observed.own);
      if(inspect(await host.recordsFor(entry.date),entry).own)throw new ReviewRequired('unknown_result');
    }
    return {result:'verified'};
  }catch(error){
    if(error instanceof ReviewRequired&&error.message==='login_required'&&!hasStartedWriting)throw error;
    const allowed=['conflict','unknown_result','host_unavailable','public_unverified','booking_changed'];
    const reason=allowed.includes(error?.message)?error.message:hasStartedWriting?'unknown_result':'host_unavailable';
    return {result:'review',reason};
  }finally{host.beforeWrite=null;}
}
