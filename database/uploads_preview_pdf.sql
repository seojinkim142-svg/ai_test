alter table if exists public.uploads
  add column if not exists preview_pdf_path text,
  add column if not exists preview_pdf_bucket text;

create index if not exists uploads_preview_pdf_path_idx
  on public.uploads (preview_pdf_path)
  where preview_pdf_path is not null;

comment on column public.uploads.preview_pdf_path is
  'Storage path of the server-generated PDF preview for DOCX/PPTX uploads.';

comment on column public.uploads.preview_pdf_bucket is
  'Storage bucket containing the server-generated PDF preview for DOCX/PPTX uploads.';
