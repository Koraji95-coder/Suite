/**
 * Auto-generated Supabase database types
 * Generated from: supabase/consolidated_migration.sql
 *
 * This file provides complete type safety for all Supabase queries.
 * All tables, columns, and constraints are properly typed.
 */

export type Json =
	| string
	| number
	| boolean
	| null
	| { [key: string]: Json | undefined }
	| Json[];

type DatabaseTable<Row, Insert, Update> = {
	Row: Row;
	Insert: Insert;
	Update: Update;
	Relationships: [];
};

export type Database = {
	public: {
		Tables: {
			formulas: DatabaseTable<
				{
					id: string;
					name: string;
					category: string;
					formula: string;
					description: string;
					variables: Json;
					user_id: string;
					created_at: string;
				},
				{
					id?: string;
					name: string;
					category: string;
					formula: string;
					description: string;
					variables?: Json;
					user_id?: string;
					created_at?: string;
				},
				{
					id?: string;
					name?: string;
					category?: string;
					formula?: string;
					description?: string;
					variables?: Json;
					user_id?: string;
					created_at?: string;
				}
			>;

			saved_calculations: DatabaseTable<
				{
					id: string;
					user_id: string;
					calculation_type: string;
					inputs: Json;
					results: Json;
					notes: string;
					created_at: string;
				},
				{
					id?: string;
					user_id?: string;
					calculation_type: string;
					inputs?: Json;
					results?: Json;
					notes?: string;
					created_at?: string;
				},
				{
					id?: string;
					user_id?: string;
					calculation_type?: string;
					inputs?: Json;
					results?: Json;
					notes?: string;
					created_at?: string;
				}
			>;

			saved_circuits: DatabaseTable<
				{
					id: string;
					user_id: string;
					name: string;
					circuit_data: Json;
					image_url: string | null;
					created_at: string;
				},
				{
					id?: string;
					user_id?: string;
					name: string;
					circuit_data?: Json;
					image_url?: string | null;
					created_at?: string;
				},
				{
					id?: string;
					user_id?: string;
					name?: string;
					circuit_data?: Json;
					image_url?: string | null;
					created_at?: string;
				}
			>;

			projects: DatabaseTable<
				{
					id: string;
					name: string;
					description: string;
					deadline: string | null;
					priority: "low" | "medium" | "high" | "urgent";
					color: string;
					status: "active" | "completed" | "archived" | "on-hold";
					category: string;
					created_at: string;
					updated_at: string;
					user_id: string;
				},
				{
					id?: string;
					name: string;
					description?: string;
					deadline?: string | null;
					priority?: "low" | "medium" | "high" | "urgent";
					color?: string;
					status?: "active" | "completed" | "archived" | "on-hold";
					category?: string;
					created_at?: string;
					updated_at?: string;
					user_id?: string;
				},
				{
					id?: string;
					name?: string;
					description?: string;
					deadline?: string | null;
					priority?: "low" | "medium" | "high" | "urgent";
					color?: string;
					status?: "active" | "completed" | "archived" | "on-hold";
					category?: string;
					created_at?: string;
					updated_at?: string;
					user_id?: string;
				}
			>;

			tasks: DatabaseTable<
				{
					id: string;
					project_id: string | null;
					name: string;
					description: string;
					completed: boolean;
					order: number;
					due_date: string | null;
					parent_task_id: string | null;
					priority: "low" | "medium" | "high" | "urgent";
					created_at: string;
					user_id: string;
				},
				{
					id?: string;
					project_id?: string | null;
					name: string;
					description?: string;
					completed?: boolean;
					order?: number;
					due_date?: string | null;
					parent_task_id?: string | null;
					priority?: "low" | "medium" | "high" | "urgent";
					created_at?: string;
					user_id?: string;
				},
				{
					id?: string;
					project_id?: string | null;
					name?: string;
					description?: string;
					completed?: boolean;
					order?: number;
					due_date?: string | null;
					parent_task_id?: string | null;
					priority?: "low" | "medium" | "high" | "urgent";
					created_at?: string;
					user_id?: string;
				}
			>;

			files: DatabaseTable<
				{
					id: string;
					project_id: string | null;
					name: string;
					file_path: string;
					size: number;
					mime_type: string;
					uploaded_at: string;
					user_id: string;
				},
				{
					id?: string;
					project_id?: string | null;
					name: string;
					file_path: string;
					size?: number;
					mime_type?: string;
					uploaded_at?: string;
					user_id?: string;
				},
				{
					id?: string;
					project_id?: string | null;
					name?: string;
					file_path?: string;
					size?: number;
					mime_type?: string;
					uploaded_at?: string;
					user_id?: string;
				}
			>;

			profiles: DatabaseTable<
				{
					id: string;
					email: string | null;
					display_name: string | null;
					avatar_url: string | null;
					theme_preference: string | null;
					created_at: string;
					updated_at: string;
				},
				{
					id: string;
					email?: string | null;
					display_name?: string | null;
					avatar_url?: string | null;
					theme_preference?: string | null;
					created_at?: string;
					updated_at?: string;
				},
				{
					id?: string;
					email?: string | null;
					display_name?: string | null;
					avatar_url?: string | null;
					theme_preference?: string | null;
					created_at?: string;
					updated_at?: string;
				}
			>;

			recent_files: DatabaseTable<
				{
					id: string;
					user_id: string;
					file_name: string;
					file_path: string;
					file_type: string;
					context: string;
					accessed_at: string;
					created_at: string;
				},
				{
					id?: string;
					user_id: string;
					file_name: string;
					file_path: string;
					file_type?: string;
					context?: string;
					accessed_at?: string;
					created_at?: string;
				},
				{
					id?: string;
					user_id?: string;
					file_name?: string;
					file_path?: string;
					file_type?: string;
					context?: string;
					accessed_at?: string;
					created_at?: string;
				}
			>;

			activity_log: DatabaseTable<
				{
					id: string;
					action: string;
					description: string;
					project_id: string | null;
					task_id: string | null;
					timestamp: string;
					user_id: string;
				},
				{
					id?: string;
					action: string;
					description: string;
					project_id?: string | null;
					task_id?: string | null;
					timestamp?: string;
					user_id?: string;
				},
				{
					id?: string;
					action?: string;
					description?: string;
					project_id?: string | null;
					task_id?: string | null;
					timestamp?: string;
					user_id?: string;
				}
			>;

			calendar_events: DatabaseTable<
				{
					id: string;
					project_id: string | null;
					task_id: string | null;
					due_date: string;
					title: string;
					type: "deadline" | "milestone" | "reminder";
					description: string | null;
					location: string | null;
					color: string | null;
					all_day: boolean;
					start_at: string | null;
					end_at: string | null;
					user_id: string;
				},
				{
					id?: string;
					project_id?: string | null;
					task_id?: string | null;
					due_date: string;
					title: string;
					type?: "deadline" | "milestone" | "reminder";
					description?: string | null;
					location?: string | null;
					color?: string | null;
					all_day?: boolean;
					start_at?: string | null;
					end_at?: string | null;
					user_id?: string;
				},
				{
					id?: string;
					project_id?: string | null;
					task_id?: string | null;
					due_date?: string;
					title?: string;
					type?: "deadline" | "milestone" | "reminder";
					description?: string | null;
					location?: string | null;
					color?: string | null;
					all_day?: boolean;
					start_at?: string | null;
					end_at?: string | null;
					user_id?: string;
				}
			>;

			whiteboards: DatabaseTable<
				{
					id: string;
					user_id: string;
					title: string;
					panel_context: string;
					canvas_data: Json;
					thumbnail_url: string | null;
					tags: string[];
					created_at: string;
					updated_at: string;
				},
				{
					id?: string;
					user_id?: string;
					title: string;
					panel_context: string;
					canvas_data?: Json;
					thumbnail_url?: string | null;
					tags?: string[];
					created_at?: string;
					updated_at?: string;
				},
				{
					id?: string;
					user_id?: string;
					title?: string;
					panel_context?: string;
					canvas_data?: Json;
					thumbnail_url?: string | null;
					tags?: string[];
					created_at?: string;
					updated_at?: string;
				}
			>;

			ai_conversations: DatabaseTable<
				{
					id: string;
					user_id: string;
					panel_context: string | null;
					title: string | null;
					messages: Json;
					context_data: Json;
					created_at: string;
					updated_at: string;
				},
				{
					id?: string;
					user_id?: string;
					panel_context?: string | null;
					title?: string | null;
					messages?: Json;
					context_data?: Json;
					created_at?: string;
					updated_at?: string;
				},
				{
					id?: string;
					user_id?: string;
					panel_context?: string | null;
					title?: string | null;
					messages?: Json;
					context_data?: Json;
					created_at?: string;
					updated_at?: string;
				}
			>;

			ai_memory: DatabaseTable<
				{
					id: string;
					user_id: string;
					memory_type: "preference" | "knowledge" | "pattern" | "relationship";
					content: Json;
					connections: Json;
					strength: number;
					created_at: string;
					last_accessed: string;
				},
				{
					id?: string;
					user_id?: string;
					memory_type: "preference" | "knowledge" | "pattern" | "relationship";
					content: Json;
					connections?: Json;
					strength?: number;
					created_at?: string;
					last_accessed?: string;
				},
				{
					id?: string;
					user_id?: string;
					memory_type?: "preference" | "knowledge" | "pattern" | "relationship";
					content?: Json;
					connections?: Json;
					strength?: number;
					created_at?: string;
					last_accessed?: string;
				}
			>;

			block_library: DatabaseTable<
				{
					id: string;
					user_id: string;
					name: string;
					file_path: string;
					thumbnail_url: string | null;
					category: string;
					tags: string[];
					is_dynamic: boolean;
					dynamic_variations: Json;
					attributes: Json;
					views: Json;
					file_size: number;
					usage_count: number;
					is_favorite: boolean;
					created_at: string;
					last_used: string | null;
				},
				{
					id?: string;
					user_id?: string;
					name: string;
					file_path: string;
					thumbnail_url?: string | null;
					category?: string;
					tags?: string[];
					is_dynamic?: boolean;
					dynamic_variations?: Json;
					attributes?: Json;
					views?: Json;
					file_size?: number;
					usage_count?: number;
					is_favorite?: boolean;
					created_at?: string;
					last_used?: string | null;
				},
				{
					id?: string;
					user_id?: string;
					name?: string;
					file_path?: string;
					thumbnail_url?: string | null;
					category?: string;
					tags?: string[];
					is_dynamic?: boolean;
					dynamic_variations?: Json;
					attributes?: Json;
					views?: Json;
					file_size?: number;
					usage_count?: number;
					is_favorite?: boolean;
					created_at?: string;
					last_used?: string | null;
				}
			>;

			automation_workflows: DatabaseTable<
				{
					id: string;
					user_id: string;
					name: string;
					description: string | null;
					workflow_type: "calculation" | "integration" | "report" | "custom";
					script_data: Json;
					schedule: string | null;
					is_active: boolean;
					last_run: string | null;
					run_count: number;
					created_at: string;
				},
				{
					id?: string;
					user_id?: string;
					name: string;
					description?: string | null;
					workflow_type: "calculation" | "integration" | "report" | "custom";
					script_data?: Json;
					schedule?: string | null;
					is_active?: boolean;
					last_run?: string | null;
					run_count?: number;
					created_at?: string;
				},
				{
					id?: string;
					user_id?: string;
					name?: string;
					description?: string | null;
					workflow_type?: "calculation" | "integration" | "report" | "custom";
					script_data?: Json;
					schedule?: string | null;
					is_active?: boolean;
					last_run?: string | null;
					run_count?: number;
					created_at?: string;
				}
			>;

			drawing_annotations: DatabaseTable<
				{
					id: string;
					user_id: string;
					project_id: string | null;
					drawing_name: string;
					file_path: string;
					annotation_data: Json;
					qa_checks: Json;
					comparison_data: Json;
					issues_found: Json;
					status: "pending" | "reviewed" | "approved" | "rejected";
					created_at: string;
					reviewed_at: string | null;
				},
				{
					id?: string;
					user_id?: string;
					project_id?: string | null;
					drawing_name: string;
					file_path: string;
					annotation_data?: Json;
					qa_checks?: Json;
					comparison_data?: Json;
					issues_found?: Json;
					status?: "pending" | "reviewed" | "approved" | "rejected";
					created_at?: string;
					reviewed_at?: string | null;
				},
				{
					id?: string;
					user_id?: string;
					project_id?: string | null;
					drawing_name?: string;
					file_path?: string;
					annotation_data?: Json;
					qa_checks?: Json;
					comparison_data?: Json;
					issues_found?: Json;
					status?: "pending" | "reviewed" | "approved" | "rejected";
					created_at?: string;
					reviewed_at?: string | null;
				}
			>;

			user_settings: DatabaseTable<
				{
					id: string;
					user_id: string;
					setting_key: string;
					setting_value: Json;
					project_id: string | null;
					created_at: string;
					updated_at: string;
				},
				{
					id?: string;
					user_id: string;
					setting_key: string;
					setting_value: Json;
					project_id?: string | null;
					created_at?: string;
					updated_at?: string;
				},
				{
					id?: string;
					user_id?: string;
					setting_key?: string;
					setting_value?: Json;
					project_id?: string | null;
					created_at?: string;
					updated_at?: string;
				}
			>;

			ground_grid_rods: DatabaseTable<
				{
					id: string;
					design_id: string;
					label: string;
					grid_x: number;
					grid_y: number;
					depth: number;
					diameter: number;
					sort_order: number;
				},
				{
					id?: string;
					design_id: string;
					label: string;
					grid_x: number;
					grid_y: number;
					depth: number;
					diameter: number;
					sort_order?: number;
				},
				{
					id?: string;
					design_id?: string;
					label?: string;
					grid_x?: number;
					grid_y?: number;
					depth?: number;
					diameter?: number;
					sort_order?: number;
				}
			>;

			ground_grid_conductors: DatabaseTable<
				{
					id: string;
					design_id: string;
					label: string;
					length: number | null;
					x1: number;
					y1: number;
					x2: number;
					y2: number;
					diameter: number;
					sort_order: number;
				},
				{
					id?: string;
					design_id: string;
					label: string;
					length?: number | null;
					x1: number;
					y1: number;
					x2: number;
					y2: number;
					diameter: number;
					sort_order?: number;
				},
				{
					id?: string;
					design_id?: string;
					label?: string;
					length?: number | null;
					x1?: number;
					y1?: number;
					x2?: number;
					y2?: number;
					diameter?: number;
					sort_order?: number;
				}
			>;

			ground_grid_designs: DatabaseTable<
				{
					id: string;
					name: string;
					project_id: string | null;
					config: Json;
					updated_at: string;
				},
				{
					id?: string;
					name: string;
					project_id?: string | null;
					config: Json;
					updated_at?: string;
				},
				{
					id?: string;
					name?: string;
					project_id?: string | null;
					config?: Json;
					updated_at?: string;
				}
			>;

			ground_grid_results: DatabaseTable<
				{
					id: string;
					design_id: string;
					placements: Json;
					segment_count: number;
					tee_count: number;
					cross_count: number;
					rod_count: number;
					total_conductor_length: number;
				},
				{
					id?: string;
					design_id: string;
					placements: Json;
					segment_count: number;
					tee_count: number;
					cross_count: number;
					rod_count: number;
					total_conductor_length: number;
				},
				{
					id?: string;
					design_id?: string;
					placements?: Json;
					segment_count?: number;
					tee_count?: number;
					cross_count?: number;
					rod_count?: number;
					total_conductor_length?: number;
				}
			>;

			user_preferences: DatabaseTable<
				{
					id: string;
					user_id: string;
					theme: string;
					layout: string;
					notifications_enabled: boolean;
					auto_save: boolean;
					language: string;
					created_at: string;
					updated_at: string;
				},
				{
					id?: string;
					user_id?: string;
					theme?: string;
					layout?: string;
					notifications_enabled?: boolean;
					auto_save?: boolean;
					language?: string;
					created_at?: string;
					updated_at?: string;
				},
				{
					id?: string;
					user_id?: string;
					theme?: string;
					layout?: string;
					notifications_enabled?: boolean;
					auto_save?: boolean;
					language?: string;
					created_at?: string;
					updated_at?: string;
				}
			>;
		};
		Views: Record<string, never>;
		Functions: {
			upsert_user_setting: {
				Args: {
					p_user_id: string;
					p_setting_key: string;
					p_setting_value: Json;
					p_project_id?: string | null;
				};
				Returns: undefined;
			};
		};
		Enums: {
			project_status: "active" | "completed" | "archived" | "on-hold";
			project_priority: "low" | "medium" | "high" | "urgent";
			task_priority: "low" | "medium" | "high" | "urgent";
			event_type: "deadline" | "milestone" | "reminder";
			memory_type: "preference" | "knowledge" | "pattern" | "relationship";
			workflow_type: "calculation" | "integration" | "report" | "custom";
			annotation_status: "pending" | "reviewed" | "approved" | "rejected";
		};
		CompositeTypes: Record<string, never>;
	};
};

/**
 * Type helper for Supabase client configuration
 */
export type Tables = Database["public"]["Tables"];
export type Enums = Database["public"]["Enums"];
