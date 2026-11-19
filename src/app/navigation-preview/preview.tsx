'use client';
import { useState } from 'react';
import { NavigationContent, navigationGroups } from '@/components/AppShell';
import NavigationIcon from '@/components/NavigationIcon';

export default function NavigationPreview() {
 const [role,setRole]=useState('captain');
 const [path,setPath]=useState('/display/fixtures');
 const [open,setOpen]=useState(false);
 const groups=navigationGroups.map(group=>({...group,items:group.items.filter(item=>role==='owner'||(!item.ownerOnly&&!item.officerOnly&&!item.administratorOnly&&(!item.captainOnly||role==='captain')))})).filter(group=>group.items.length);
 const label=groups.flatMap(g=>g.items).find(i=>i.href===path)?.label??'Dashboard';
 const props={groups,pathname:path.split('?')[0],currentSearch:path.split('?')[1]??'',roleLabel:role==='owner'?'System Owner':role==='captain'?'Captain / Vice-captain':'Player',teamNames:['Example team'],onNavigate:(href:string,event:React.MouseEvent<HTMLAnchorElement>)=>{event.preventDefault();setPath(href);setOpen(false);},onSignOut:()=>setOpen(false)};
 return <div className="rf-app-shell min-h-screen bg-slate-50">
  <aside className="fixed inset-y-0 left-0 hidden w-72 lg:block"><NavigationContent {...props}/></aside>
  <div className="lg:pl-72">
   <header className="rf-app-header sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200 bg-white px-3 shadow-sm sm:px-5">
    <button type="button" className="flex h-11 shrink-0 items-center gap-2 rounded-xl bg-teal-700 px-3 text-white lg:hidden" onClick={()=>setOpen(true)} aria-label="Open navigation" aria-expanded={open}><NavigationIcon name="menu"/><span className="text-xs font-bold">Menu</span></button>
    <div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-widest text-teal-700">Rack &amp; Frame</p><p className="truncate text-sm font-black">{label}</p></div><NavigationIcon name="bell"/>
   </header>
   <main className="mx-auto max-w-3xl space-y-6 p-5 sm:p-10">
    <section className="rounded-3xl bg-gradient-to-br from-[#102a3b] to-[#0b1730] p-7 text-white shadow-xl"><p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-200">Design preview</p><h1 className="mt-3 text-3xl font-black">Your league. A clearer menu.</h1><p className="mt-4 leading-7 text-slate-300">Explore the icons, sections and selected-page highlights. On a phone, tap the teal Menu button above.</p></section>
    <section className="rounded-2xl border bg-white p-6"><label className="font-bold" htmlFor="preview-role">Preview menu as</label><select id="preview-role" value={role} onChange={e=>setRole(e.target.value)} className="mt-3 w-full rounded-xl border p-3"><option value="player">Player</option><option value="captain">Captain / Vice-captain</option><option value="owner">System Owner</option></select><p className="mt-4 text-sm leading-6 text-slate-500">Sample navigation only: these links select a preview screen. No live records, votes or account permissions are changed.</p></section>
    <section className="rounded-2xl border border-teal-100 bg-teal-50 p-6"><h2 className="font-bold text-teal-950">Selected screen</h2><p className="mt-2 text-2xl font-bold text-teal-800">{label}</p><p className="mt-3 text-sm text-teal-900">The working app is available at the root of this preview deployment after signing in.</p></section>
   </main>
  </div>
  {open&&<div className="rf-mobile-navigation fixed inset-0 z-[80] bg-[#0b1730] lg:hidden" role="dialog" aria-modal="true" aria-label="Rack & Frame navigation"><button type="button" onClick={()=>setOpen(false)} className="rf-navigation-close absolute right-4 top-4 z-10 grid h-10 w-10 place-items-center rounded-lg border border-white/20 bg-white/10 text-white" aria-label="Close navigation"><NavigationIcon name="close"/></button><NavigationContent {...props}/></div>}
 </div>;
}
