import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { listNotes } from "@/lib/data/notes";
import { PageHeader } from "@/components/shared/page-header";
import { NoteList } from "@/components/harmony/notes/note-list";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("notes");
  return { title: t("title") };
}

export default async function NotesPage() {
  const t = await getTranslations("notes");
  const notes = await listNotes();
  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <NoteList notes={notes} />
    </>
  );
}
