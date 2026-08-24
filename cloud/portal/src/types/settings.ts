export interface Thresholds {
  monitorOfflineMinutes: number;
}

export interface DBUser {
  id: string;
  username: string;
  role: string;
  active: boolean;
  client_id: string | null;
  client_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface DBClient {
  id: string;
  name: string;
}

export interface DBFeedback {
  id: string;
  type: string;
  title: string;
  description: string;
  image_url: string | null;
  status: string;
  created_at: string;
  username: string;
}
