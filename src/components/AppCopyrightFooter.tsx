export default function AppCopyrightFooter() {
  return (
    <footer className="border-t border-slate-800 bg-slate-950 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-xs text-slate-300">
      <p>
        Rack &amp; Frame League Manager &copy; {new Date().getFullYear()} Martin Chamberlain. All rights reserved.
      </p>
    </footer>
  );
}
