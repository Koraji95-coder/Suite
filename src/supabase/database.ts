/**
 * Auto-generated Supabase database types.
 * Generated via: npm run supabase:types
 * Source of truth: local Supabase migrations in supabase/migrations/
 *
 * Refresh flow:
 *   1. npm run supabase:start
 *   2. npm run supabase:db:reset
 *   3. npm run supabase:types
 */

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
      activity_log: {
        Row: {
          action: string
          description: string
          id: string
          project_id: string | null
          task_id: string | null
          timestamp: string
          user_id: string
        }
        Insert: {
          action: string
          description: string
          id?: string
          project_id?: string | null
          task_id?: string | null
          timestamp?: string
          user_id: string
        }
        Update: {
          action?: string
          description?: string
          id?: string
          project_id?: string | null
          task_id?: string | null
          timestamp?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_workflows: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          last_run: string | null
          name: string
          run_count: number
          schedule: string | null
          script_data: Json
          user_id: string
          workflow_type: Database["public"]["Enums"]["workflow_type"]
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          last_run?: string | null
          name: string
          run_count?: number
          schedule?: string | null
          script_data?: Json
          user_id: string
          workflow_type: Database["public"]["Enums"]["workflow_type"]
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          last_run?: string | null
          name?: string
          run_count?: number
          schedule?: string | null
          script_data?: Json
          user_id?: string
          workflow_type?: Database["public"]["Enums"]["workflow_type"]
        }
        Relationships: []
      }
      block_library: {
        Row: {
          attributes: Json
          category: string
          created_at: string
          dynamic_variations: Json
          file_path: string
          file_size: number
          id: string
          is_dynamic: boolean
          is_favorite: boolean
          last_used: string | null
          name: string
          tags: string[]
          thumbnail_url: string | null
          usage_count: number
          user_id: string
          views: Json
        }
        Insert: {
          attributes?: Json
          category?: string
          created_at?: string
          dynamic_variations?: Json
          file_path: string
          file_size?: number
          id?: string
          is_dynamic?: boolean
          is_favorite?: boolean
          last_used?: string | null
          name: string
          tags?: string[]
          thumbnail_url?: string | null
          usage_count?: number
          user_id: string
          views?: Json
        }
        Update: {
          attributes?: Json
          category?: string
          created_at?: string
          dynamic_variations?: Json
          file_path?: string
          file_size?: number
          id?: string
          is_dynamic?: boolean
          is_favorite?: boolean
          last_used?: string | null
          name?: string
          tags?: string[]
          thumbnail_url?: string | null
          usage_count?: number
          user_id?: string
          views?: Json
        }
        Relationships: []
      }
      calendar_events: {
        Row: {
          all_day: boolean
          color: string | null
          description: string | null
          due_date: string
          end_at: string | null
          id: string
          location: string | null
          project_id: string | null
          start_at: string | null
          task_id: string | null
          title: string
          type: Database["public"]["Enums"]["event_type"]
          user_id: string
        }
        Insert: {
          all_day?: boolean
          color?: string | null
          description?: string | null
          due_date: string
          end_at?: string | null
          id?: string
          location?: string | null
          project_id?: string | null
          start_at?: string | null
          task_id?: string | null
          title: string
          type?: Database["public"]["Enums"]["event_type"]
          user_id: string
        }
        Update: {
          all_day?: boolean
          color?: string | null
          description?: string | null
          due_date?: string
          end_at?: string | null
          id?: string
          location?: string | null
          project_id?: string | null
          start_at?: string | null
          task_id?: string | null
          title?: string
          type?: Database["public"]["Enums"]["event_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      drawing_annotations: {
        Row: {
          annotation_data: Json
          comparison_data: Json
          created_at: string
          drawing_name: string
          file_path: string
          id: string
          issues_found: Json
          project_id: string | null
          qa_checks: Json
          reviewed_at: string | null
          status: Database["public"]["Enums"]["annotation_status"]
          user_id: string
        }
        Insert: {
          annotation_data?: Json
          comparison_data?: Json
          created_at?: string
          drawing_name: string
          file_path: string
          id?: string
          issues_found?: Json
          project_id?: string | null
          qa_checks?: Json
          reviewed_at?: string | null
          status?: Database["public"]["Enums"]["annotation_status"]
          user_id: string
        }
        Update: {
          annotation_data?: Json
          comparison_data?: Json
          created_at?: string
          drawing_name?: string
          file_path?: string
          id?: string
          issues_found?: Json
          project_id?: string | null
          qa_checks?: Json
          reviewed_at?: string | null
          status?: Database["public"]["Enums"]["annotation_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "drawing_annotations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      drawing_revision_register_entries: {
        Row: {
          autodraft_request_id: string | null
          created_at: string
          drawing_number: string
          file_id: string | null
          id: string
          issue_severity: string
          issue_status: string
          issue_summary: string
          notes: string | null
          previous_revision: string | null
          project_id: string
          revision: string
          revision_by: string
          revision_checked_by: string
          revision_date: string | null
          revision_description: string
          revision_sort_order: number
          source_kind: string
          source_ref: string | null
          title: string
          transmittal_document_name: string | null
          transmittal_number: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          autodraft_request_id?: string | null
          created_at?: string
          drawing_number?: string
          file_id?: string | null
          id?: string
          issue_severity?: string
          issue_status?: string
          issue_summary?: string
          notes?: string | null
          previous_revision?: string | null
          project_id: string
          revision?: string
          revision_by?: string
          revision_checked_by?: string
          revision_date?: string | null
          revision_description?: string
          revision_sort_order?: number
          source_kind?: string
          source_ref?: string | null
          title?: string
          transmittal_document_name?: string | null
          transmittal_number?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          autodraft_request_id?: string | null
          created_at?: string
          drawing_number?: string
          file_id?: string | null
          id?: string
          issue_severity?: string
          issue_status?: string
          issue_summary?: string
          notes?: string | null
          previous_revision?: string | null
          project_id?: string
          revision?: string
          revision_by?: string
          revision_checked_by?: string
          revision_date?: string | null
          revision_description?: string
          revision_sort_order?: number
          source_kind?: string
          source_ref?: string | null
          title?: string
          transmittal_document_name?: string | null
          transmittal_number?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "drawing_revision_register_entries_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drawing_revision_register_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_title_block_profiles: {
        Row: {
          acade_project_file_path: string | null
          acade_line1: string
          acade_line2: string
          acade_line4: string
          block_name: string
          created_at: string
          id: string
          project_id: string
          project_root_path: string | null
          signer_checked_by: string
          signer_drawn_by: string
          signer_engineer: string
          updated_at: string
          user_id: string
        }
        Insert: {
          acade_project_file_path?: string | null
          acade_line1?: string
          acade_line2?: string
          acade_line4?: string
          block_name?: string
          created_at?: string
          id?: string
          project_id: string
          project_root_path?: string | null
          signer_checked_by?: string
          signer_drawn_by?: string
          signer_engineer?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          acade_project_file_path?: string | null
          acade_line1?: string
          acade_line2?: string
          acade_line4?: string
          block_name?: string
          created_at?: string
          id?: string
          project_id?: string
          project_root_path?: string | null
          signer_checked_by?: string
          signer_drawn_by?: string
          signer_engineer?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_title_block_profiles_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_markup_snapshots: {
        Row: {
          compare_payload: Json
          contract_version: string
          created_at: string
          drawing_name: string | null
          drawing_path: string
          id: string
          issue_set_id: string | null
          page_index: number
          prepare_payload: Json
          project_id: string
          reviewed_bundle_json: Json
          revision_context: Json | null
          selected_action_ids: string[]
          selected_operation_ids: string[]
          source_pdf_name: string
          updated_at: string
          user_id: string
          warnings: string[]
        }
        Insert: {
          compare_payload?: Json
          contract_version?: string
          created_at?: string
          drawing_name?: string | null
          drawing_path: string
          id?: string
          issue_set_id?: string | null
          page_index?: number
          prepare_payload?: Json
          project_id: string
          reviewed_bundle_json?: Json
          revision_context?: Json | null
          selected_action_ids?: string[]
          selected_operation_ids?: string[]
          source_pdf_name: string
          updated_at?: string
          user_id: string
          warnings?: string[]
        }
        Update: {
          compare_payload?: Json
          contract_version?: string
          created_at?: string
          drawing_name?: string | null
          drawing_path?: string
          id?: string
          issue_set_id?: string | null
          page_index?: number
          prepare_payload?: Json
          project_id?: string
          reviewed_bundle_json?: Json
          revision_context?: Json | null
          selected_action_ids?: string[]
          selected_operation_ids?: string[]
          source_pdf_name?: string
          updated_at?: string
          user_id?: string
          warnings?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "project_markup_snapshots_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_automation_runs: {
        Row: {
          artifacts: Json
          changed_drawing_count: number
          changed_item_count: number
          created_at: string
          download_url: string | null
          id: string
          issue_set_id: string | null
          operations: Json
          project_id: string
          recipe_id: string | null
          report_filename: string | null
          report_id: string | null
          request_id: string | null
          simulate_on_copy: boolean
          status: string
          updated_at: string
          user_id: string
          verification_artifacts: Json
          warnings: string[]
          work_package_id: string | null
        }
        Insert: {
          artifacts?: Json
          changed_drawing_count?: number
          changed_item_count?: number
          created_at?: string
          download_url?: string | null
          id?: string
          issue_set_id?: string | null
          operations?: Json
          project_id: string
          recipe_id?: string | null
          report_filename?: string | null
          report_id?: string | null
          request_id?: string | null
          simulate_on_copy?: boolean
          status?: string
          updated_at?: string
          user_id: string
          verification_artifacts?: Json
          warnings?: string[]
          work_package_id?: string | null
        }
        Update: {
          artifacts?: Json
          changed_drawing_count?: number
          changed_item_count?: number
          created_at?: string
          download_url?: string | null
          id?: string
          issue_set_id?: string | null
          operations?: Json
          project_id?: string
          recipe_id?: string | null
          report_filename?: string | null
          report_id?: string | null
          request_id?: string | null
          simulate_on_copy?: boolean
          status?: string
          updated_at?: string
          user_id?: string
          verification_artifacts?: Json
          warnings?: string[]
          work_package_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_automation_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_cad_write_passes: {
        Row: {
          after_json: Json | null
          artifact_refs: Json
          before_json: Json | null
          created_at: string
          drawing_path: string
          handle_refs: string[]
          id: string
          managed_key: string | null
          operation_type: string
          project_id: string
          run_id: string | null
          snapshot_id: string | null
          status: string
          updated_at: string
          user_id: string
          warnings: string[]
          writer_kind: string
        }
        Insert: {
          after_json?: Json | null
          artifact_refs?: Json
          before_json?: Json | null
          created_at?: string
          drawing_path: string
          handle_refs?: string[]
          id?: string
          managed_key?: string | null
          operation_type: string
          project_id: string
          run_id?: string | null
          snapshot_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
          warnings?: string[]
          writer_kind: string
        }
        Update: {
          after_json?: Json | null
          artifact_refs?: Json
          before_json?: Json | null
          created_at?: string
          drawing_path?: string
          handle_refs?: string[]
          id?: string
          managed_key?: string | null
          operation_type?: string
          project_id?: string
          run_id?: string | null
          snapshot_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          warnings?: string[]
          writer_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_cad_write_passes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      files: {
        Row: {
          file_path: string
          id: string
          mime_type: string
          name: string
          project_id: string | null
          size: number
          uploaded_at: string
          user_id: string
        }
        Insert: {
          file_path: string
          id?: string
          mime_type?: string
          name: string
          project_id?: string | null
          size?: number
          uploaded_at?: string
          user_id: string
        }
        Update: {
          file_path?: string
          id?: string
          mime_type?: string
          name?: string
          project_id?: string | null
          size?: number
          uploaded_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      formulas: {
        Row: {
          category: string
          created_at: string
          description: string
          formula: string
          id: string
          name: string
          user_id: string
          variables: Json
        }
        Insert: {
          category: string
          created_at?: string
          description?: string
          formula: string
          id?: string
          name: string
          user_id: string
          variables?: Json
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          formula?: string
          id?: string
          name?: string
          user_id?: string
          variables?: Json
        }
        Relationships: []
      }
      ground_grid_conductors: {
        Row: {
          design_id: string
          diameter: number
          id: string
          label: string
          length: number | null
          sort_order: number
          x1: number
          x2: number
          y1: number
          y2: number
        }
        Insert: {
          design_id: string
          diameter: number
          id?: string
          label: string
          length?: number | null
          sort_order?: number
          x1: number
          x2: number
          y1: number
          y2: number
        }
        Update: {
          design_id?: string
          diameter?: number
          id?: string
          label?: string
          length?: number | null
          sort_order?: number
          x1?: number
          x2?: number
          y1?: number
          y2?: number
        }
        Relationships: [
          {
            foreignKeyName: "ground_grid_conductors_design_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "ground_grid_designs"
            referencedColumns: ["id"]
          },
        ]
      }
      ground_grid_designs: {
        Row: {
          config: Json
          id: string
          name: string
          project_id: string | null
          updated_at: string
        }
        Insert: {
          config?: Json
          id?: string
          name: string
          project_id?: string | null
          updated_at?: string
        }
        Update: {
          config?: Json
          id?: string
          name?: string
          project_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ground_grid_designs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ground_grid_results: {
        Row: {
          cross_count: number
          design_id: string
          id: string
          placements: Json
          rod_count: number
          segment_count: number
          tee_count: number
          total_conductor_length: number
        }
        Insert: {
          cross_count?: number
          design_id: string
          id?: string
          placements?: Json
          rod_count?: number
          segment_count?: number
          tee_count?: number
          total_conductor_length?: number
        }
        Update: {
          cross_count?: number
          design_id?: string
          id?: string
          placements?: Json
          rod_count?: number
          segment_count?: number
          tee_count?: number
          total_conductor_length?: number
        }
        Relationships: [
          {
            foreignKeyName: "ground_grid_results_design_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "ground_grid_designs"
            referencedColumns: ["id"]
          },
        ]
      }
      ground_grid_rods: {
        Row: {
          depth: number
          design_id: string
          diameter: number
          grid_x: number
          grid_y: number
          id: string
          label: string
          sort_order: number
        }
        Insert: {
          depth: number
          design_id: string
          diameter: number
          grid_x: number
          grid_y: number
          id?: string
          label: string
          sort_order?: number
        }
        Update: {
          depth?: number
          design_id?: string
          diameter?: number
          grid_x?: number
          grid_y?: number
          id?: string
          label?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "ground_grid_rods_design_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "ground_grid_designs"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          theme_preference: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          theme_preference?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          theme_preference?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      project_drawing_work_segments: {
        Row: {
          command_count: number
          created_at: string
          drawing_name: string
          drawing_path: string
          id: string
          idle_ms: number
          project_id: string
          segment_ended_at: string
          segment_started_at: string
          source_session_id: string
          sync_key: string
          tracked_ms: number
          updated_at: string
          user_id: string
          work_date: string
          workstation_id: string
        }
        Insert: {
          command_count?: number
          created_at?: string
          drawing_name?: string
          drawing_path: string
          id?: string
          idle_ms?: number
          project_id: string
          segment_ended_at: string
          segment_started_at: string
          source_session_id?: string
          sync_key: string
          tracked_ms?: number
          updated_at?: string
          user_id: string
          work_date: string
          workstation_id?: string
        }
        Update: {
          command_count?: number
          created_at?: string
          drawing_name?: string
          drawing_path?: string
          id?: string
          idle_ms?: number
          project_id?: string
          segment_ended_at?: string
          segment_started_at?: string
          source_session_id?: string
          sync_key?: string
          tracked_ms?: number
          updated_at?: string
          user_id?: string
          work_date?: string
          workstation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_drawing_work_segments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          category: string
          color: string
          created_at: string
          deadline: string | null
          description: string
          firm_number: string
          id: string
          name: string
          pdf_package_root_path: string | null
          pe_name: string
          priority: Database["public"]["Enums"]["project_priority"]
          status: Database["public"]["Enums"]["project_status"]
          updated_at: string
          user_id: string
          watchdog_root_path: string | null
        }
        Insert: {
          category?: string
          color?: string
          created_at?: string
          deadline?: string | null
          description?: string
          firm_number?: string
          id?: string
          name: string
          pdf_package_root_path?: string | null
          pe_name?: string
          priority?: Database["public"]["Enums"]["project_priority"]
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
          user_id: string
          watchdog_root_path?: string | null
        }
        Update: {
          category?: string
          color?: string
          created_at?: string
          deadline?: string | null
          description?: string
          firm_number?: string
          id?: string
          name?: string
          pdf_package_root_path?: string | null
          pe_name?: string
          priority?: Database["public"]["Enums"]["project_priority"]
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
          user_id?: string
          watchdog_root_path?: string | null
        }
        Relationships: []
      }
      recent_files: {
        Row: {
          accessed_at: string
          context: string
          created_at: string
          file_name: string
          file_path: string
          file_type: string
          id: string
          user_id: string
        }
        Insert: {
          accessed_at?: string
          context?: string
          created_at?: string
          file_name: string
          file_path: string
          file_type?: string
          id?: string
          user_id: string
        }
        Update: {
          accessed_at?: string
          context?: string
          created_at?: string
          file_name?: string
          file_path?: string
          file_type?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      saved_calculations: {
        Row: {
          calculation_type: string
          created_at: string
          id: string
          inputs: Json
          notes: string
          results: Json
          user_id: string
        }
        Insert: {
          calculation_type: string
          created_at?: string
          id?: string
          inputs?: Json
          notes?: string
          results?: Json
          user_id: string
        }
        Update: {
          calculation_type?: string
          created_at?: string
          id?: string
          inputs?: Json
          notes?: string
          results?: Json
          user_id?: string
        }
        Relationships: []
      }
      saved_circuits: {
        Row: {
          circuit_data: Json
          created_at: string
          id: string
          image_url: string | null
          name: string
          user_id: string
        }
        Insert: {
          circuit_data?: Json
          created_at?: string
          id?: string
          image_url?: string | null
          name: string
          user_id: string
        }
        Update: {
          circuit_data?: Json
          created_at?: string
          id?: string
          image_url?: string | null
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          completed: boolean
          created_at: string
          description: string
          due_date: string | null
          id: string
          name: string
          order: number
          parent_task_id: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          project_id: string | null
          user_id: string
        }
        Insert: {
          completed?: boolean
          created_at?: string
          description?: string
          due_date?: string | null
          id?: string
          name: string
          order?: number
          parent_task_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string | null
          user_id: string
        }
        Update: {
          completed?: boolean
          created_at?: string
          description?: string
          due_date?: string | null
          id?: string
          name?: string
          order?: number
          parent_task_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      user_passkeys: {
        Row: {
          aaguid: string | null
          backed_up: boolean
          created_at: string
          credential_id: string
          device_type: string | null
          friendly_name: string | null
          id: string
          last_used_at: string | null
          public_key: string
          revoked_at: string | null
          sign_count: number
          transports: string[]
          updated_at: string
          user_email: string
          user_id: string
        }
        Insert: {
          aaguid?: string | null
          backed_up?: boolean
          created_at?: string
          credential_id: string
          device_type?: string | null
          friendly_name?: string | null
          id?: string
          last_used_at?: string | null
          public_key: string
          revoked_at?: string | null
          sign_count?: number
          transports?: string[]
          updated_at?: string
          user_email: string
          user_id: string
        }
        Update: {
          aaguid?: string | null
          backed_up?: boolean
          created_at?: string
          credential_id?: string
          device_type?: string | null
          friendly_name?: string | null
          id?: string
          last_used_at?: string | null
          public_key?: string
          revoked_at?: string | null
          sign_count?: number
          transports?: string[]
          updated_at?: string
          user_email?: string
          user_id?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          auto_save: boolean
          created_at: string
          id: string
          language: string
          layout: string
          notifications_enabled: boolean
          theme: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_save?: boolean
          created_at?: string
          id?: string
          language?: string
          layout?: string
          notifications_enabled?: boolean
          theme?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_save?: boolean
          created_at?: string
          id?: string
          language?: string
          layout?: string
          notifications_enabled?: boolean
          theme?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          created_at: string
          id: string
          project_id: string | null
          setting_key: string
          setting_value: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id?: string | null
          setting_key: string
          setting_value?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string | null
          setting_key?: string
          setting_value?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_settings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      whiteboards: {
        Row: {
          canvas_data: Json
          created_at: string
          id: string
          panel_context: string
          tags: string[]
          thumbnail_url: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          canvas_data?: Json
          created_at?: string
          id?: string
          panel_context: string
          tags?: string[]
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          canvas_data?: Json
          created_at?: string
          id?: string
          panel_context?: string
          tags?: string[]
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      work_ledger_entries: {
        Row: {
          app_area: string | null
          architecture_paths: string[]
          commit_refs: string[]
          created_at: string
          external_reference: string | null
          external_url: string | null
          hotspot_ids: string[]
          id: string
          lifecycle_state: string
          project_id: string | null
          publish_state: string
          published_at: string | null
          source_kind: string
          summary: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          app_area?: string | null
          architecture_paths?: string[]
          commit_refs?: string[]
          created_at?: string
          external_reference?: string | null
          external_url?: string | null
          hotspot_ids?: string[]
          id?: string
          lifecycle_state?: string
          project_id?: string | null
          publish_state?: string
          published_at?: string | null
          source_kind?: string
          summary?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          app_area?: string | null
          architecture_paths?: string[]
          commit_refs?: string[]
          created_at?: string
          external_reference?: string | null
          external_url?: string | null
          hotspot_ids?: string[]
          id?: string
          lifecycle_state?: string
          project_id?: string | null
          publish_state?: string
          published_at?: string | null
          source_kind?: string
          summary?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_ledger_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      work_ledger_publish_jobs: {
        Row: {
          artifact_dir: string | null
          created_at: string
          entry_id: string
          error_text: string | null
          external_reference: string | null
          external_url: string | null
          id: string
          mode: string
          published_at: string | null
          publisher: string
          repo_path: string | null
          status: string
          stderr_excerpt: string | null
          stdout_excerpt: string | null
          updated_at: string
          user_id: string
          workstation_id: string | null
        }
        Insert: {
          artifact_dir?: string | null
          created_at?: string
          entry_id: string
          error_text?: string | null
          external_reference?: string | null
          external_url?: string | null
          id?: string
          mode: string
          published_at?: string | null
          publisher: string
          repo_path?: string | null
          status: string
          stderr_excerpt?: string | null
          stdout_excerpt?: string | null
          updated_at?: string
          user_id: string
          workstation_id?: string | null
        }
        Update: {
          artifact_dir?: string | null
          created_at?: string
          entry_id?: string
          error_text?: string | null
          external_reference?: string | null
          external_url?: string | null
          id?: string
          mode?: string
          published_at?: string | null
          publisher?: string
          repo_path?: string | null
          status?: string
          stderr_excerpt?: string | null
          stdout_excerpt?: string | null
          updated_at?: string
          user_id?: string
          workstation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_ledger_publish_jobs_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "work_ledger_entries"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      project_belongs_to_auth_user: {
        Args: { p_project_id: string }
        Returns: boolean
      }
      task_belongs_to_auth_user: {
        Args: { p_task_id: string }
        Returns: boolean
      }
      upsert_user_setting: {
        Args: {
          p_project_id?: string
          p_setting_key: string
          p_setting_value: Json
          p_user_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      annotation_status: "pending" | "reviewed" | "approved" | "rejected"
      event_type: "deadline" | "milestone" | "reminder"
      project_priority: "low" | "medium" | "high" | "urgent"
      project_status: "active" | "completed" | "archived" | "on-hold"
      task_priority: "low" | "medium" | "high" | "urgent"
      workflow_type: "calculation" | "integration" | "report" | "custom"
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
      annotation_status: ["pending", "reviewed", "approved", "rejected"],
      event_type: ["deadline", "milestone", "reminder"],
      project_priority: ["low", "medium", "high", "urgent"],
      project_status: ["active", "completed", "archived", "on-hold"],
      task_priority: ["low", "medium", "high", "urgent"],
      workflow_type: ["calculation", "integration", "report", "custom"],
    },
  },
} as const
