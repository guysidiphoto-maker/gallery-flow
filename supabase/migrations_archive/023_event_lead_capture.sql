-- Event lead capture: events + event_leads tables
-- Supports QR-based lead collection at live events with WhatsApp delivery

CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL,
  gallery_id UUID REFERENCES galleries(id),
  name TEXT NOT NULL,
  gallery_url TEXT NOT NULL,
  welcome_text TEXT DEFAULT 'קבלו את הגלריה שלכם ישירות לוואטסאפ',
  logo_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_events_business_id ON events(business_id);

-- RLS: public read for active events (guests need to load event info)
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read active events" ON events
  FOR SELECT USING (is_active = true);
CREATE POLICY "Business owners manage their events" ON events
  FOR ALL USING (business_id IN (
    SELECT id FROM businesses WHERE user_id = auth.uid()
  ));

CREATE TABLE event_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  whatsapp_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (whatsapp_status IN ('pending', 'sent', 'failed')),
  whatsapp_message_id TEXT,
  whatsapp_error TEXT,
  retry_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, phone)
);

CREATE INDEX idx_event_leads_event_id ON event_leads(event_id);
CREATE INDEX idx_event_leads_failed ON event_leads(whatsapp_status, retry_count)
  WHERE whatsapp_status = 'failed' AND retry_count < 3;

-- RLS: leads are written by the API (service role), read by business owner
ALTER TABLE event_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Business owners read their event leads" ON event_leads
  FOR SELECT USING (event_id IN (
    SELECT id FROM events WHERE business_id IN (
      SELECT id FROM businesses WHERE user_id = auth.uid()
    )
  ));
