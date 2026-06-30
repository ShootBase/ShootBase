
CREATE POLICY "Users can upload own support attachments" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'support-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can read own support attachments" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'support-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete own support attachments" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'support-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Admins can read all support attachments" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'support-attachments' AND public.has_role(auth.uid(), 'admin'));
