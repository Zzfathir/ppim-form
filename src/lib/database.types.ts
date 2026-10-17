
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "activity_log": {
                  Row: {
                    "action": string,"actor_id": string | null,"created_at": string,"entity_id": string | null,"entity_type": string,"id": string,"meta": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"created_at"?: string,"entity_id"?: string | null,"entity_type": string,"id"?: string,"meta"?: NonNullable<Json>
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"created_at"?: string,"entity_id"?: string | null,"entity_type"?: string,"id"?: string,"meta"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "activity_log_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "department_members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "activity_log_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"app_settings": {
                  Row: {
                    "id": boolean,"require_admin_approval": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: boolean,"require_admin_approval"?: boolean
                  }
                  Update: {
                    "id"?: boolean,"require_admin_approval"?: boolean
                  }
                  Relationships: [
                    
                  ]
                },"categories": {
                  Row: {
                    "id": string,"is_active": boolean,"name": string,"sort": number
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"is_active"?: boolean,"name": string,"sort"?: number
                  }
                  Update: {
                    "id"?: string,"is_active"?: boolean,"name"?: string,"sort"?: number
                  }
                  Relationships: [
                    
                  ]
                },"chapters": {
                  Row: {
                    "created_at": string,"description": string | null,"id": string,"is_archived": boolean,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"description"?: string | null,"id"?: string,"is_archived"?: boolean,"name": string
                  }
                  Update: {
                    "created_at"?: string,"description"?: string | null,"id"?: string,"is_archived"?: boolean,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"departments": {
                  Row: {
                    "color": string,"created_at": string,"description": string | null,"id": string,"is_archived": boolean,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "color"?: string,"created_at"?: string,"description"?: string | null,"id"?: string,"is_archived"?: boolean,"name": string
                  }
                  Update: {
                    "color"?: string,"created_at"?: string,"description"?: string | null,"id"?: string,"is_archived"?: boolean,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"forms": {
                  Row: {
                    "category_id": string | null,"chapter_id": string | null,"closed_at": string | null,"closes_at": string | null,"collect_name": boolean,"confirmation_message": string | null,"created_at": string,"deleted_at": string | null,"department_id": string | null,"description": string | null,"id": string,"internal_note": string | null,"limit_one_response": boolean,"owner_id": string,"published_at": string | null,"requires_login": boolean,"share_slug": string,"status": Database["public"]['Enums']["form_status"],"template_id": string | null,"theme_color": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category_id"?: string | null,"chapter_id"?: string | null,"closed_at"?: string | null,"closes_at"?: string | null,"collect_name"?: boolean,"confirmation_message"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"department_id"?: string | null,"description"?: string | null,"id"?: string,"internal_note"?: string | null,"limit_one_response"?: boolean,"owner_id": string,"published_at"?: string | null,"requires_login"?: boolean,"share_slug"?: string,"status"?: Database["public"]['Enums']["form_status"],"template_id"?: string | null,"theme_color"?: string,"title"?: string,"updated_at"?: string
                  }
                  Update: {
                    "category_id"?: string | null,"chapter_id"?: string | null,"closed_at"?: string | null,"closes_at"?: string | null,"collect_name"?: boolean,"confirmation_message"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"department_id"?: string | null,"description"?: string | null,"id"?: string,"internal_note"?: string | null,"limit_one_response"?: boolean,"owner_id"?: string,"published_at"?: string | null,"requires_login"?: boolean,"share_slug"?: string,"status"?: Database["public"]['Enums']["form_status"],"template_id"?: string | null,"theme_color"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "forms_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "forms_chapter_id_fkey"
      columns: ["chapter_id"]
isOneToOne: false
      referencedRelation: "chapters"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "forms_department_id_fkey"
      columns: ["department_id"]
isOneToOne: false
      referencedRelation: "departments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "forms_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "department_members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "forms_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "forms_template_id_fkey"
      columns: ["template_id"]
isOneToOne: false
      referencedRelation: "templates"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "avatar_url": string | null,"chapter_id": string | null,"created_at": string,"department_id": string | null,"email": string,"full_name": string | null,"id": string,"last_seen_at": string | null,"role": Database["public"]['Enums']["user_role"],"status": Database["public"]['Enums']["user_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_url"?: string | null,"chapter_id"?: string | null,"created_at"?: string,"department_id"?: string | null,"email": string,"full_name"?: string | null,"id": string,"last_seen_at"?: string | null,"role"?: Database["public"]['Enums']["user_role"],"status"?: Database["public"]['Enums']["user_status"]
                  }
                  Update: {
                    "avatar_url"?: string | null,"chapter_id"?: string | null,"created_at"?: string,"department_id"?: string | null,"email"?: string,"full_name"?: string | null,"id"?: string,"last_seen_at"?: string | null,"role"?: Database["public"]['Enums']["user_role"],"status"?: Database["public"]['Enums']["user_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_chapter_id_fkey"
      columns: ["chapter_id"]
isOneToOne: false
      referencedRelation: "chapters"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "profiles_department_id_fkey"
      columns: ["department_id"]
isOneToOne: false
      referencedRelation: "departments"
      referencedColumns: ["id"]
    }
                  ]
                },"questions": {
                  Row: {
                    "description": string | null,"form_id": string,"id": string,"is_deleted": boolean,"options": Json | null,"position": number,"required": boolean,"settings": NonNullable<Json>,"title": string,"type": Database["public"]['Enums']["question_type"]
                  }
                  ComputedFields: never
                  Insert: {
                    "description"?: string | null,"form_id": string,"id"?: string,"is_deleted"?: boolean,"options"?: Json | null,"position": number,"required"?: boolean,"settings"?: NonNullable<Json>,"title"?: string,"type": Database["public"]['Enums']["question_type"]
                  }
                  Update: {
                    "description"?: string | null,"form_id"?: string,"id"?: string,"is_deleted"?: boolean,"options"?: Json | null,"position"?: number,"required"?: boolean,"settings"?: NonNullable<Json>,"title"?: string,"type"?: Database["public"]['Enums']["question_type"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "questions_form_id_fkey"
      columns: ["form_id"]
isOneToOne: false
      referencedRelation: "form_stats"
      referencedColumns: ["form_id"]
    },{
      foreignKeyName: "questions_form_id_fkey"
      columns: ["form_id"]
isOneToOne: false
      referencedRelation: "forms"
      referencedColumns: ["id"]
    }
                  ]
                },"rate_limit_hits": {
                  Row: {
                    "hits": number,"key": string,"window_start": string
                  }
                  ComputedFields: never
                  Insert: {
                    "hits"?: number,"key": string,"window_start": string
                  }
                  Update: {
                    "hits"?: number,"key"?: string,"window_start"?: string
                  }
                  Relationships: [
                    
                  ]
                },"responses": {
                  Row: {
                    "answers": NonNullable<Json>,"dedupe_key": string | null,"form_id": string,"id": string,"respondent_email": string | null,"respondent_id": string | null,"respondent_name": string | null,"submitted_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "answers": NonNullable<Json>,"dedupe_key"?: string | null,"form_id": string,"id"?: string,"respondent_email"?: string | null,"respondent_id"?: string | null,"respondent_name"?: string | null,"submitted_at"?: string
                  }
                  Update: {
                    "answers"?: NonNullable<Json>,"dedupe_key"?: string | null,"form_id"?: string,"id"?: string,"respondent_email"?: string | null,"respondent_id"?: string | null,"respondent_name"?: string | null,"submitted_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "responses_form_id_fkey"
      columns: ["form_id"]
isOneToOne: false
      referencedRelation: "form_stats"
      referencedColumns: ["form_id"]
    },{
      foreignKeyName: "responses_form_id_fkey"
      columns: ["form_id"]
isOneToOne: false
      referencedRelation: "forms"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "responses_respondent_id_fkey"
      columns: ["respondent_id"]
isOneToOne: false
      referencedRelation: "department_members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "responses_respondent_id_fkey"
      columns: ["respondent_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"templates": {
                  Row: {
                    "category_id": string | null,"created_at": string,"created_by": string | null,"description": string | null,"id": string,"is_published": boolean,"questions": NonNullable<Json>,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"id"?: string,"is_published"?: boolean,"questions"?: NonNullable<Json>,"title": string
                  }
                  Update: {
                    "category_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"id"?: string,"is_published"?: boolean,"questions"?: NonNullable<Json>,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "templates_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "templates_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "department_members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "templates_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "department_members": {
                  Row: {
                    "avatar_url": string | null,"department_id": string | null,"full_name": string | null,"id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "avatar_url"?: string | null,"department_id"?: string | null,"full_name"?: string | null,"id"?: string | null
                         }
                        Update: {
                           "avatar_url"?: string | null,"department_id"?: string | null,"full_name"?: string | null,"id"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "profiles_department_id_fkey"
      columns: ["department_id"]
isOneToOne: false
      referencedRelation: "departments"
      referencedColumns: ["id"]
    }
                  ]
                },"form_stats": {
                  Row: {
                    "form_id": string | null,"last_response_at": string | null,"response_count": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "admin_approval_required":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"answered_question_ids":
{ Args: { "p_form_id": string }; Returns: string[]
                           },
"can_edit_form":
{ Args: { "p_form_id": string }; Returns: boolean
                           },
"can_read_form":
{ Args: { "p_form_id": string }; Returns: boolean
                           },
"complete_onboarding":
{ Args: { "p_chapter_id"?: string,"p_department_id": string,"p_full_name": string }; Returns: {
              "avatar_url": string | null,
"chapter_id": string | null,
"created_at": string,
"department_id": string | null,
"email": string,
"full_name": string | null,
"id": string,
"last_seen_at": string | null,
"role": Database["public"]['Enums']["user_role"],
"status": Database["public"]['Enums']["user_status"]
            }
                          SetofOptions: {
        from: "*"
        to: "profiles"
        isOneToOne: true
        isSetofReturn: false
      } },
"current_department_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"current_user_role":
{ Args: Record<PropertyKey, never>; Returns: Database["public"]['Enums']["user_role"]
                           },
"duplicate_form":
{ Args: { "p_form_id": string }; Returns: string
                           },
"form_summary":
{ Args: { "p_form_id": string }; Returns: Json
                           },
"generate_share_slug":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"hit_rate_limit":
{ Args: { "p_key": string,"p_limit": number,"p_window_seconds": number }; Returns: boolean
                           },
"is_active_or_pending_staff":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_staff":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_superadmin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"log_activity":
{ Args: { "p_action": string,"p_entity_id": string,"p_entity_type": string,"p_meta"?: Json }; Returns: undefined
                           },
"publish_check":
{ Args: { "p_form_id": string }; Returns: (string)[]
                           },
"publish_problems":
{ Args: { "p_form_id": string }; Returns: (string)[]
                           },
"responses_page":
{ Args: { "p_desc"?: boolean,"p_form_id": string,"p_limit"?: number,"p_offset"?: number,"p_query"?: string,"p_sort"?: string }; Returns: {
              "answers": Json,"id": string,"respondent_email": string,"respondent_name": string,"submitted_at": string,"total_count": number
            }[]
                           },
"save_form":
{ Args: { "p_form": Json,"p_form_id": string,"p_questions": Json }; Returns: string
                           },
"soft_delete_form":
{ Args: { "p_form_id": string }; Returns: undefined
                           }
          }
          Enums: {
            "form_status": "draft"|"open"|"closed"|"archived","question_type": "short_text"|"paragraph"|"single_choice"|"multiple_choice"|"dropdown"|"scale"|"date","user_role": "respondent"|"admin"|"superadmin","user_status": "pending"|"active"|"suspended"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "form_status": ["draft", "open", "closed", "archived"],"question_type": ["short_text", "paragraph", "single_choice", "multiple_choice", "dropdown", "scale", "date"],"user_role": ["respondent", "admin", "superadmin"],"user_status": ["pending", "active", "suspended"]
          }
        }
} as const
