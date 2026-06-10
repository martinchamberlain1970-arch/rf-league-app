"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import ScreenHeader from "@/components/ScreenHeader";
import MessageModal from "@/components/MessageModal";
import useAdminStatus from "@/components/useAdminStatus";
import { supabase } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";

type DocumentCategory = "agm_minutes" | "league_rules" | "captain_meeting_minutes";

type LeagueDocument = {
  id: string;
  category: DocumentCategory;
  title: string;
  description: string | null;
  file_name: string;
  file_path: string;
  file_url: string;
  uploaded_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  is_active: boolean;
};

type UploadDraft = {
  title: string;
  description: string;
  file: File | null;
};

const categories: Array<{
  key: DocumentCategory;
  title: string;
  description: string;
}> = [
  {
    key: "agm_minutes",
    title: "AGM Minutes",
    description: "Upload annual general meeting minutes so clubs and captains can refer back to agreed decisions.",
  },
  {
    key: "league_rules",
    title: "League & Competition Rules",
    description: "Keep the latest league rules, competition rules, and supporting documents in one reference area.",
  },
  {
    key: "captain_meeting_minutes",
    title: "Captain Meeting Minutes",
    description: "Share minutes and action notes from captain meetings throughout the season.",
  },
];

const emptyDraft = (): UploadDraft => ({ title: "", description: "", file: null });

export default function DocumentsPage() {
  const admin = useAdminStatus();
  const [message, setMessage] = useState<string | null>(null);
  const [documents, setDocuments] = useState<LeagueDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyCategory, setBusyCategory] = useState<DocumentCategory | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<DocumentCategory, UploadDraft>>({
    agm_minutes: emptyDraft(),
    league_rules: emptyDraft(),
    captain_meeting_minutes: emptyDraft(),
  });

  const groupedDocuments = useMemo(() => {
    return categories.reduce<Record<DocumentCategory, LeagueDocument[]>>((acc, category) => {
      acc[category.key] = documents
        .filter((doc) => doc.category === category.key)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return acc;
    }, { agm_minutes: [], league_rules: [], captain_meeting_minutes: [] });
  }, [documents]);

  const loadDocuments = async () => {
    const client = supabase;
    if (!client) {
      setMessage("Supabase is not configured.");
      setLoading(false);
      return;
    }
    const res = await client
      .from("league_documents")
      .select("id,category,title,description,file_name,file_path,file_url,uploaded_by_user_id,created_at,updated_at,is_active")
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    if (res.error) {
      setMessage(res.error.message);
      setLoading(false);
      return;
    }
    setDocuments((res.data ?? []) as LeagueDocument[]);
    setLoading(false);
  };

  useEffect(() => {
    void loadDocuments();
  }, []);

  const updateDraft = (category: DocumentCategory, patch: Partial<UploadDraft>) => {
    setDrafts((prev) => ({
      ...prev,
      [category]: {
        ...prev[category],
        ...patch,
      },
    }));
  };

  const uploadDocument = async (category: DocumentCategory) => {
    const client = supabase;
    if (!client || !admin.userId) return;
    if (!admin.isSuper) {
      setMessage("Only the Super User can upload league documents.");
      return;
    }

    const draft = drafts[category];
    const title = draft.title.trim();
    if (!title) {
      setMessage("Enter a document title before uploading.");
      return;
    }
    if (!draft.file) {
      setMessage("Choose a file to upload.");
      return;
    }

    const { data: sessionRes } = await client.auth.getSession();
    const token = sessionRes.session?.access_token;
    if (!token) {
      setMessage("Session expired. Please sign in again.");
      return;
    }

    setBusyCategory(category);
    const formData = new FormData();
    formData.set("category", category);
    formData.set("title", title);
    formData.set("description", draft.description.trim());
    formData.set("file", draft.file);

    const resp = await fetch("/api/documents", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });
    const body = (await resp.json().catch(() => ({}))) as { error?: string; document?: LeagueDocument };
    setBusyCategory(null);
    if (!resp.ok) {
      setMessage(body.error ?? "Failed to upload document.");
      return;
    }

    if (body.document) {
      setDocuments((prev) => [body.document as LeagueDocument, ...prev]);
    } else {
      await loadDocuments();
    }
    updateDraft(category, { title: "", description: "", file: null });
    await logAudit("league_document_uploaded", {
      entityType: "league_document",
      entityId: body.document?.id ?? null,
      summary: `${title} uploaded to ${category}.`,
      meta: { category, title, fileName: draft.file.name },
    });
    setMessage("Document uploaded.");
  };

  const deleteDocument = async (doc: LeagueDocument) => {
    const client = supabase;
    if (!client || !admin.userId) return;
    if (!admin.isSuper) {
      setMessage("Only the Super User can delete league documents.");
      return;
    }
    const { data: sessionRes } = await client.auth.getSession();
    const token = sessionRes.session?.access_token;
    if (!token) {
      setMessage("Session expired. Please sign in again.");
      return;
    }
    setDeletingId(doc.id);
    const resp = await fetch(`/api/documents/${doc.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const body = (await resp.json().catch(() => ({}))) as { error?: string };
    setDeletingId(null);
    if (!resp.ok) {
      setMessage(body.error ?? "Failed to delete document.");
      return;
    }
    setDocuments((prev) => prev.filter((entry) => entry.id !== doc.id));
    await logAudit("league_document_deleted", {
      entityType: "league_document",
      entityId: doc.id,
      summary: `${doc.title} deleted from ${doc.category}.`,
      meta: { category: doc.category, title: doc.title, fileName: doc.file_name },
    });
    setMessage("Document deleted.");
  };

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <RequireAuth>
          <ScreenHeader
            title="League Documents"
            eyebrow="Documents"
            subtitle="Store AGM minutes, rules, and captain meeting notes in one place."
          />
          <MessageModal message={message} onClose={() => setMessage(null)} />

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-600">
              This area is for league reference documents. Everyone with app access can read the current files here. Super User can upload and replace documents when new versions are available.
            </p>
          </section>

          <section className="grid gap-4 xl:grid-cols-3">
            {categories.map((category) => {
              const docs = groupedDocuments[category.key];
              const draft = drafts[category.key];
              return (
                <article key={category.key} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="mb-4">
                    <h2 className="text-xl font-semibold text-slate-900">{category.title}</h2>
                    <p className="mt-1 text-sm text-slate-600">{category.description}</p>
                  </div>

                  {admin.isSuper ? (
                    <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm font-semibold text-slate-900">Upload new document</p>
                      <div className="mt-3 space-y-2">
                        <input
                          type="text"
                          value={draft.title}
                          onChange={(e) => updateDraft(category.key, { title: e.target.value })}
                          placeholder="Document title"
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                        />
                        <textarea
                          value={draft.description}
                          onChange={(e) => updateDraft(category.key, { description: e.target.value })}
                          placeholder="Optional description"
                          rows={3}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                        />
                        <input
                          type="file"
                          accept=".pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                          onChange={(e) => updateDraft(category.key, { file: e.target.files?.[0] ?? null })}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium"
                        />
                        {draft.file ? <p className="text-xs text-slate-500">Selected: {draft.file.name}</p> : null}
                        <button
                          type="button"
                          onClick={() => void uploadDocument(category.key)}
                          disabled={busyCategory === category.key}
                          className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                        >
                          {busyCategory === category.key ? "Uploading..." : `Upload to ${category.title}`}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div className="space-y-3">
                    {loading ? <p className="text-sm text-slate-500">Loading documents...</p> : null}
                    {!loading && docs.length === 0 ? (
                      <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                        No documents have been uploaded in this section yet.
                      </p>
                    ) : null}
                    {docs.map((doc) => (
                      <div key={doc.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-900">{doc.title}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              Uploaded {new Date(doc.created_at).toLocaleString()}
                            </p>
                            {doc.description ? <p className="mt-2 text-sm text-slate-600">{doc.description}</p> : null}
                            <p className="mt-2 text-xs text-slate-500">File: {doc.file_name}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              href={doc.file_url}
                              target="_blank"
                              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                            >
                              Open
                            </Link>
                            <a
                              href={doc.file_url}
                              download={doc.file_name}
                              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                            >
                              Download
                            </a>
                            {admin.isSuper ? (
                              <button
                                type="button"
                                onClick={() => void deleteDocument(doc)}
                                disabled={deletingId === doc.id}
                                className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800 disabled:opacity-60"
                              >
                                {deletingId === doc.id ? "Deleting..." : "Delete"}
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </section>
        </RequireAuth>
      </div>
    </main>
  );
}
