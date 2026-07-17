export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string
          created_at: string
          details: Json | null
          id: string
          target_name: string | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name: string
          created_at?: string
          details?: Json | null
          id?: string
          target_name?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string
          created_at?: string
          details?: Json | null
          id?: string
          target_name?: string | null
          target_user_id?: string | null
        }
        Relationships: []
      }
      auth_lockouts: {
        Row: {
          failed_attempts: number
          last_failed_at: string | null
          locked_until: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          failed_attempts?: number
          last_failed_at?: string | null
          locked_until?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          failed_attempts?: number
          last_failed_at?: string | null
          locked_until?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          deactivated_at: string | null
          full_name: string
          has_password: boolean
          id: string
          site: Database["public"]["Enums"]["site_code"]
        }
        Insert: {
          created_at?: string
          deactivated_at?: string | null
          full_name: string
          has_password?: boolean
          id: string
          site: Database["public"]["Enums"]["site_code"]
        }
        Update: {
          created_at?: string
          deactivated_at?: string | null
          full_name?: string
          has_password?: boolean
          id?: string
          site?: Database["public"]["Enums"]["site_code"]
        }
        Relationships: []
      }
      projects: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          archived: boolean
          blocker: string | null
          category: Database["public"]["Enums"]["project_category"] | null
          completion_pct: number
          created_at: string
          description: string | null
          due_date: string | null
          entry_type: Database["public"]["Enums"]["entry_type"]
          featured: boolean
          id: string
          name: string
          next_action: string | null
          owner_id: string
          pending_approval: boolean
          previous_status: Database["public"]["Enums"]["project_status"] | null
          previous_support_status:
            | Database["public"]["Enums"]["support_status"]
            | null
          priority: Database["public"]["Enums"]["project_priority"]
          problem_statement: string | null
          rejection_reason: string | null
          requester: string | null
          site: Database["public"]["Enums"]["site_code"]
          start_date: string | null
          status: Database["public"]["Enums"]["project_status"]
          support_status: Database["public"]["Enums"]["support_status"] | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          archived?: boolean
          blocker?: string | null
          category?: Database["public"]["Enums"]["project_category"] | null
          completion_pct?: number
          created_at?: string
          description?: string | null
          due_date?: string | null
          entry_type?: Database["public"]["Enums"]["entry_type"]
          featured?: boolean
          id?: string
          name: string
          next_action?: string | null
          owner_id: string
          pending_approval?: boolean
          previous_status?: Database["public"]["Enums"]["project_status"] | null
          previous_support_status?:
            | Database["public"]["Enums"]["support_status"]
            | null
          priority?: Database["public"]["Enums"]["project_priority"]
          problem_statement?: string | null
          rejection_reason?: string | null
          requester?: string | null
          site: Database["public"]["Enums"]["site_code"]
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          support_status?: Database["public"]["Enums"]["support_status"] | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          archived?: boolean
          blocker?: string | null
          category?: Database["public"]["Enums"]["project_category"] | null
          completion_pct?: number
          created_at?: string
          description?: string | null
          due_date?: string | null
          entry_type?: Database["public"]["Enums"]["entry_type"]
          featured?: boolean
          id?: string
          name?: string
          next_action?: string | null
          owner_id?: string
          pending_approval?: boolean
          previous_status?: Database["public"]["Enums"]["project_status"] | null
          previous_support_status?:
            | Database["public"]["Enums"]["support_status"]
            | null
          priority?: Database["public"]["Enums"]["project_priority"]
          problem_statement?: string | null
          rejection_reason?: string | null
          requester?: string | null
          site?: Database["public"]["Enums"]["site_code"]
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          support_status?: Database["public"]["Enums"]["support_status"] | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      weekly_updates: {
        Row: {
          author_id: string
          blocker: string | null
          created_at: string
          id: string
          note: string
          project_id: string
          reviewed: boolean
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["project_status"] | null
          support_status: Database["public"]["Enums"]["support_status"] | null
          week_label: string
        }
        Insert: {
          author_id: string
          blocker?: string | null
          created_at?: string
          id?: string
          note: string
          project_id: string
          reviewed?: boolean
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["project_status"] | null
          support_status?: Database["public"]["Enums"]["support_status"] | null
          week_label: string
        }
        Update: {
          author_id?: string
          blocker?: string | null
          created_at?: string
          id?: string
          note?: string
          project_id?: string
          reviewed?: boolean
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["project_status"] | null
          support_status?: Database["public"]["Enums"]["support_status"] | null
          week_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_updates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "contributor"
      entry_type: "project" | "support"
      project_category:
        | "Efficiency"
        | "Safety"
        | "Quality"
        | "Maintenance"
        | "Training"
        | "Cost"
      project_priority: "Low" | "Medium" | "High"
      project_status:
        | "On Track"
        | "At Risk"
        | "Blocked"
        | "Complete"
        | "On Hold"
      site_code:
        | "Allentown"
        | "Modesto"
        | "Midlothian"
        | "Alexandria"
        | "3rd Ave"
        | "EPIC"
      support_status: "Open" | "In Progress" | "Done"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "contributor"],
      entry_type: ["project", "support"],
      project_category: [
        "Efficiency",
        "Safety",
        "Quality",
        "Maintenance",
        "Training",
        "Cost",
      ],
      project_priority: ["Low", "Medium", "High"],
      project_status: ["On Track", "At Risk", "Blocked", "Complete", "On Hold"],
      site_code: [
        "Allentown",
        "Modesto",
        "Midlothian",
        "Alexandria",
        "3rd Ave",
        "EPIC",
      ],
      support_status: ["Open", "In Progress", "Done"],
    },
  },
} as const
