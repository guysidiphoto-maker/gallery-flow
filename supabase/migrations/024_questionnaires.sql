-- Questionnaires: photographer creates a questionnaire, client fills it out
-- Simple text-based questions only (no ratings, no file uploads)

CREATE TABLE questionnaires (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL,
  gallery_id UUID REFERENCES galleries(id),
  title TEXT NOT NULL,
  description TEXT,
  questions JSONB NOT NULL DEFAULT '[]',
  -- questions schema: [{ "id": "uuid", "label": "text", "required": boolean }]
  background_url TEXT,
  send_method TEXT NOT NULL DEFAULT 'none' CHECK (send_method IN ('none', 'email', 'sms')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_questionnaires_business_id ON questionnaires(business_id);
CREATE INDEX idx_questionnaires_gallery_id ON questionnaires(gallery_id);

-- RLS: public read for active questionnaires (clients need to load them)
ALTER TABLE questionnaires ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read active questionnaires" ON questionnaires
  FOR SELECT USING (is_active = true);
CREATE POLICY "Business owners manage their questionnaires" ON questionnaires
  FOR ALL USING (business_id IN (
    SELECT id FROM businesses WHERE user_id = auth.uid()
  ));

CREATE TABLE questionnaire_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  questionnaire_id UUID NOT NULL REFERENCES questionnaires(id),
  respondent_name TEXT NOT NULL,
  respondent_phone TEXT,
  respondent_email TEXT,
  answers JSONB NOT NULL DEFAULT '{}',
  -- answers schema: { "question_id": "answer text" }
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_qr_questionnaire_id ON questionnaire_responses(questionnaire_id);

-- RLS: responses written by API (service role), read by business owner
ALTER TABLE questionnaire_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Business owners read their questionnaire responses" ON questionnaire_responses
  FOR SELECT USING (questionnaire_id IN (
    SELECT id FROM questionnaires WHERE business_id IN (
      SELECT id FROM businesses WHERE user_id = auth.uid()
    )
  ));
-- Allow anonymous inserts (clients submitting responses)
CREATE POLICY "Anyone can submit responses" ON questionnaire_responses
  FOR INSERT WITH CHECK (true);
