-- Create storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('gallery-images', 'gallery-images', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('gallery-thumbnails', 'gallery-thumbnails', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('gallery-stories', 'gallery-stories', true);

-- Public read policies for storage
CREATE POLICY "Public read gallery-images" ON storage.objects FOR SELECT USING (bucket_id = 'gallery-images');
CREATE POLICY "Public read gallery-thumbnails" ON storage.objects FOR SELECT USING (bucket_id = 'gallery-thumbnails');
CREATE POLICY "Public read gallery-stories" ON storage.objects FOR SELECT USING (bucket_id = 'gallery-stories');

-- Allow anon upload (temporary)
CREATE POLICY "Allow upload gallery-images" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'gallery-images');
CREATE POLICY "Allow upload gallery-thumbnails" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'gallery-thumbnails');
CREATE POLICY "Allow upload gallery-stories" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'gallery-stories');
