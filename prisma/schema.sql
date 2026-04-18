CREATE TABLE users (
  id UUID PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  state TEXT NOT NULL,
  city TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'United States',
  identification_no TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  profile_pic_url TEXT,
  role TEXT NOT NULL DEFAULT 'USER',
  reset_token TEXT,
  reset_token_expiry TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE trips (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  flight_number TEXT NOT NULL,
  airline_name TEXT NOT NULL,
  departure_airport TEXT NOT NULL,
  destination_airport TEXT NOT NULL,
  departure_date_time TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_trips_user_departure ON trips(user_id, departure_date_time);

CREATE TABLE bags (
  id UUID PRIMARY KEY,
  trip_id UUID NOT NULL REFERENCES trips(id),
  tag_number TEXT NOT NULL,
  description TEXT NOT NULL,
  image_path TEXT,
  weight_lbs NUMERIC(8,2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_bags_trip_tag ON bags(trip_id, tag_number);

CREATE TABLE tracking_logs (
  id UUID PRIMARY KEY,
  bag_id UUID NOT NULL REFERENCES bags(id),
  status TEXT NOT NULL,
  airport_location TEXT,
  remarks TEXT,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_tracking_bag_time ON tracking_logs(bag_id, timestamp);

CREATE TABLE notifications (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  bag_id UUID REFERENCES bags(id),
  message TEXT NOT NULL,
  type TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notifications_user_created ON notifications(user_id, created_at);

CREATE TABLE subscriptions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  plan_months INT NOT NULL,
  amount INT NOT NULL,
  stripe_payment_intent_id TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_subscriptions_user_status ON subscriptions(user_id, status);
