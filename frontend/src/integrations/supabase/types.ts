export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export interface Database {
    public: {
        Tables: {
            projects: {
                Row: {
                    id: string
                    name: string
                    description: string
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    name?: string
                    description?: string
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    name?: string
                    description?: string
                    created_at?: string
                    updated_at?: string
                }
                Relationships: []
            }
            versions: {
                Row: {
                    id: string
                    project_id: string
                    created_at: string
                    message: string
                    project_state: Json
                    change_summary: Json | null
                    diffs: Json | null
                }
                Insert: {
                    id?: string
                    project_id: string
                    created_at?: string
                    message?: string
                    project_state: Json
                    change_summary?: Json | null
                    diffs?: Json | null
                }
                Update: {
                    id?: string
                    project_id?: string
                    created_at?: string
                    message?: string
                    project_state?: Json
                    change_summary?: Json | null
                    diffs?: Json | null
                }
                Relationships: [
                    {
                        foreignKeyName: "versions_project_id_fkey"
                        columns: ["project_id"]
                        isOneToOne: false
                        referencedRelation: "projects"
                        referencedColumns: ["id"]
                    }
                ]
            }
        }
        Views: {
            [_ in never]: never
        }
        Functions: {
            [_ in never]: never
        }
        Enums: {
            [_ in never]: never
        }
        CompositeTypes: {
            [_ in never]: never
        }
    }
}
