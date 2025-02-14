export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      drum_kit_samples: {
        Row: {
          created_at: string | null
          filename: string
          id: string
          kit_id: string | null
          sample_type: Database["public"]["Enums"]["drum_sample_type"]
          storage_path: string
        }
        Insert: {
          created_at?: string | null
          filename: string
          id?: string
          kit_id?: string | null
          sample_type: Database["public"]["Enums"]["drum_sample_type"]
          storage_path: string
        }
        Update: {
          created_at?: string | null
          filename?: string
          id?: string
          kit_id?: string | null
          sample_type?: Database["public"]["Enums"]["drum_sample_type"]
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "drum_kit_samples_kit_id_fkey"
            columns: ["kit_id"]
            isOneToOne: false
            referencedRelation: "drum_kits"
            referencedColumns: ["id"]
          },
        ]
      }
      drum_kits: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      drum_samples: {
        Row: {
          created_at: string
          filename: string
          id: string
          name: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          filename: string
          id?: string
          name: string
          storage_path: string
        }
        Update: {
          created_at?: string
          filename?: string
          id?: string
          name?: string
          storage_path?: string
        }
        Relationships: []
      }
      processed_tracks: {
        Row: {
          combined_file_path: string | null
          created_at: string | null
          drums_file_path: string | null
          error_message: string | null
          id: string
          melody_file_path: string | null
          musical_analysis: Json | null
          output_url: string | null
          pattern_data: Json | null
          processed_audio_status: string | null
          processed_audio_url: string | null
          processing_status: string | null
          processing_type: Database["public"]["Enums"]["processing_type"] | null
          recording_id: string | null
          tempo: number | null
          time_signature: string | null
          updated_at: string | null
          version: number | null
        }
        Insert: {
          combined_file_path?: string | null
          created_at?: string | null
          drums_file_path?: string | null
          error_message?: string | null
          id?: string
          melody_file_path?: string | null
          musical_analysis?: Json | null
          output_url?: string | null
          pattern_data?: Json | null
          processed_audio_status?: string | null
          processed_audio_url?: string | null
          processing_status?: string | null
          processing_type?:
            | Database["public"]["Enums"]["processing_type"]
            | null
          recording_id?: string | null
          tempo?: number | null
          time_signature?: string | null
          updated_at?: string | null
          version?: number | null
        }
        Update: {
          combined_file_path?: string | null
          created_at?: string | null
          drums_file_path?: string | null
          error_message?: string | null
          id?: string
          melody_file_path?: string | null
          musical_analysis?: Json | null
          output_url?: string | null
          pattern_data?: Json | null
          processed_audio_status?: string | null
          processed_audio_url?: string | null
          processing_status?: string | null
          processing_type?:
            | Database["public"]["Enums"]["processing_type"]
            | null
          recording_id?: string | null
          tempo?: number | null
          time_signature?: string | null
          updated_at?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "processed_tracks_recording_id_fkey"
            columns: ["recording_id"]
            isOneToOne: false
            referencedRelation: "recordings"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          id: string
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          id: string
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      recordings: {
        Row: {
          created_at: string
          duration: number | null
          filename: string
          id: string
          processed_text: string | null
          status: Database["public"]["Enums"]["recording_status"] | null
          storage_path: string
          timestamp: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          duration?: number | null
          filename: string
          id?: string
          processed_text?: string | null
          status?: Database["public"]["Enums"]["recording_status"] | null
          storage_path: string
          timestamp?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          duration?: number | null
          filename?: string
          id?: string
          processed_text?: string | null
          status?: Database["public"]["Enums"]["recording_status"] | null
          storage_path?: string
          timestamp?: string
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      drum_sample_type:
        | "kick"
        | "snare"
        | "hihat"
        | "crash"
        | "tom"
        | "percussion"
      processing_type: "drums" | "melody" | "instrumentation"
      recording_status: "pending" | "processing" | "completed" | "failed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never
