-- v8.09 — allow authenticated users to edit only their own chat messages.
drop policy if exists "authenticated can edit own messages" on public.messages;
create policy "authenticated can edit own messages"
on public.messages
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
