export const dashboardInfo = {
  title: 'Dashboard Information',
  colorScheme: 'teal' as const,
  sections: [
    {
      title: 'Overview',
      content: 'The Dashboard provides a comprehensive view of your active projects, recent activities, calendar events, and storage usage. It serves as the central hub for monitoring all your electrical engineering work.',
    },
    {
      title: 'Key Features',
      content: [
        'Active Projects widget showing deadline status and completion progress',
        'Calendar integration displaying project deadlines and task due dates',
        'Recent activity feed tracking all system actions',
        'Storage usage monitoring with real-time updates',
        'Quick navigation to any project from the dashboard',
      ],
    },
    {
      title: 'Customization',
      content: [
        'Click on any project card to view detailed information',
        'Calendar dates with deadlines are highlighted in red',
        'Activity feed updates automatically as you work',
        'Storage metrics refresh when files are uploaded or deleted',
      ],
      tips: [
        'Use the calendar to quickly identify upcoming deadlines',
        'Click the clock in the header to see current system time',
        'Activity feed helps track what you worked on recently',
      ],
    },
  ],
};

export const projectsInfo = {
  title: 'Project Manager Information',
  colorScheme: 'teal' as const,
  sections: [
    {
      title: 'Project Management',
      content: 'The Project Manager allows you to organize your electrical engineering projects with tasks, deadlines, files, and calendar integration. Create hierarchical task structures with subtasks and track project progress.',
    },
    {
      title: 'Creating Projects',
      content: [
        'Click "New Project" button to create a project',
        'Set project name, description, deadline, and priority',
        'Choose a color to easily identify the project',
        'Select project status: active, on-hold, completed, or archived',
      ],
    },
    {
      title: 'Managing Tasks',
      content: [
        'Add tasks to any project with due dates and priority levels',
        'Create subtasks by clicking the "+" icon on any task',
        'Mark tasks complete by clicking the checkbox',
        'Drag tasks to reorder them (feature coming soon)',
        'Tasks with due dates automatically appear in the calendar',
      ],
      tips: [
        'Use urgent priority for critical tasks',
        'Subtasks help break down complex work into manageable pieces',
        'Color-code projects for quick visual identification',
        'Calendar view shows all deadlines across all projects',
      ],
    },
    {
      title: 'File Management',
      content: [
        'Upload files directly to any project',
        'Files are stored securely in Supabase Storage',
        'View, download, or delete files from the Files tab',
        'Search files by name or type using the search box',
      ],
    },
  ],
};

export const storageInfo = {
  title: 'Storage & Database Information',
  colorScheme: 'teal' as const,
  sections: [
    {
      title: 'File Storage',
      content: 'The Storage Manager provides access to all files across your projects. Browse files by project, search by name or type, and manage your file library in one central location.',
    },
    {
      title: 'Database Browser',
      content: [
        'View all database tables and their contents',
        'Inspect table schemas and row counts',
        'Browse data directly from the interface',
        'Monitor database health and structure',
      ],
    },
    {
      title: 'Database Info Section',
      content: 'Click "Database Info" to view:',
    },
    {
      title: 'Connection Details',
      content: [
        'Supabase connection status and configuration',
        'Environment variables (pre-configured automatically)',
        'Database URL and API keys status',
      ],
    },
    {
      title: 'Schema Information',
      content: [
        'Core Tables: projects, tasks, files, calendar_events, activity_log',
        'Engineering Tables: formulas, saved_calculations, saved_circuits',
        'Enhanced Tables: whiteboards, ai_conversations, ai_memory, block_library, automation_workflows, drawing_annotations, user_preferences',
      ],
    },
    {
      title: 'How to Update Database',
      content: [
        'All database changes are done through migrations',
        'Migrations stored in supabase/migrations/ directory',
        'Each migration has a timestamp and descriptive name',
        'Migrations run automatically and maintain history',
        'Row Level Security (RLS) protects all user data',
      ],
      tips: [
        'Never commit database credentials to version control',
        'Always use migrations for schema changes',
        'Test RLS policies before deploying to production',
        'Keep regular backups of important data',
        'Use Database Info to understand table structure',
      ],
    },
  ],
};

export const appsInfo = {
  title: 'Apps & Automation Information',
  colorScheme: 'teal' as const,
  sections: [
    {
      title: 'Apps & Automation Overview',
      content: 'This hub provides specialized tools and automation features designed for electrical engineering workflows. Each app integrates seamlessly with your projects, files, and database, creating a unified engineering workspace.',
    },
    {
      title: 'QA/QC Standards Checker',
      content: [
        'Automated drawing compliance verification',
        'Verifies title block completeness and accuracy',
        'Checks text sizes against engineering standards',
        'Validates drawing scale and units consistency',
        'Identifies unused layers and objects for cleanup',
        'Flags non-standard layer naming conventions',
        'Generates detailed compliance reports',
      ],
      tips: [
        'Run QA/QC checks before submitting drawings',
        'Configure custom rules based on your standards',
        'Export reports for quality documentation',
        'Use to train team on drafting standards',
      ],
    },
    {
      title: 'Block Library',
      content: [
        'Centralized CAD block management with cloud sync',
        'Upload and organize AutoCAD DWG blocks',
        '3D preview and visualization of blocks',
        'Categorize blocks by discipline or project',
        'Tag blocks for enhanced searchability',
        'Track block usage and versions',
        'Share blocks across team members',
      ],
      tips: [
        'Mark frequently used blocks as favorites',
        'Use tags to organize by project type',
        'Maintain consistent naming conventions',
        'Regular cleanup of unused blocks',
      ],
    },
    {
      title: 'Transmittal Builder',
      content: [
        'Create professional transmittal documents',
        'Auto-populate from project file lists',
        'Track drawing revisions and changes',
        'Generate PDF transmittal letters',
        'Maintain transmittal history',
        'Include custom notes and instructions',
        'Email integration for distribution',
      ],
      tips: [
        'Create templates for common transmittals',
        'Include revision descriptions for clarity',
        'Maintain organized transmittal logs',
      ],
    },
    {
      title: 'Ground Grid Generator',
      content: [
        'Design facility and campus ground grids',
        'IEEE 80 compliant calculations',
        'Automatic grid layout generation',
        'Step and touch potential analysis',
        'Soil resistivity modeling',
        'Export to CAD for detailed design',
        'Generate calculation reports',
      ],
      tips: [
        'Start with soil resistivity measurements',
        'Verify fault current data before design',
        'Review safety margins carefully',
      ],
    },
    {
      title: 'How to Use Apps',
      content: [
        'Click any app card to launch the tool',
        'Apps with green "Active" badges are fully functional',
        'Apps marked "Coming Soon" will show a preview modal',
        'Use the filter dropdown to view apps by category',
        'All apps automatically save data to your Supabase database',
        'Return to Apps Hub using the back arrow button',
      ],
    },
    {
      title: 'App Configuration',
      content: [
        'QA/QC: Configure standards rules in drawing_annotations table',
        'Block Library: Set default categories and tags in user preferences',
        'Transmittal: Create company templates in project settings',
        'Ground Grid: Set default safety factors and calculation methods',
        'All settings are stored per-user in the database',
        'Settings sync across all devices automatically',
      ],
    },
    {
      title: 'Running & Setup',
      content: [
        'Apps are pre-configured and ready to use immediately',
        'No installation or external dependencies required',
        'Database tables created automatically via migrations',
        'Files stored securely in Supabase Storage',
        'All apps work offline with local caching',
        'Data syncs automatically when online',
      ],
      tips: [
        'Explore each app to discover all features',
        'Apps integrate with Project Manager seamlessly',
        'Use automation features to save time',
        'Request new apps based on your workflow needs',
      ],
    },
    {
      title: 'Adding Custom Apps',
      content: [
        'Apps are modular React components',
        'Create new app entry in apps array in AppsHub.tsx',
        'Build component in src/components/ directory',
        'Define database schema in new migration file',
        'Add app icon from lucide-react library',
        'Integrate with existing project context',
        'Deploy and test with real project data',
      ],
    },
  ],
};

export const knowledgeInfo = {
  title: 'Knowledge Base Information',
  colorScheme: 'blue' as const,
  sections: [
    {
      title: 'Knowledge Base Overview',
      content: 'The Knowledge Base contains all your electrical engineering tools, formulas, calculations, and reference materials. Add custom content to any section to build your personal engineering library.',
    },
    {
      title: 'Adding Formulas',
      content: [
        'Navigate to Formula Bank',
        'Click "Add Formula" button',
        'Enter formula name (e.g., "Ohm\'s Law")',
        'Specify category (e.g., "Basic Laws", "Power Calculations")',
        'Input the formula using standard notation (e.g., "V = I × R")',
        'Add description explaining the formula usage',
        'Formulas are saved to Supabase and available across all devices',
      ],
    },
    {
      title: 'Saving Calculations',
      content: [
        'Perform calculations in any calculator panel',
        'Click "Save Calculation" after computing results',
        'Add notes describing the calculation context',
        'Saved calculations are stored with inputs, outputs, and notes',
        'Retrieve past calculations from the saved calculations list',
        'Use saved calculations as templates for similar problems',
      ],
    },
    {
      title: 'Working with Circuits',
      content: [
        'Use Circuit Generator to create circuit diagrams',
        'Add components by clicking the component buttons',
        'Connect components to build your circuit',
        'Save circuits with descriptive names',
        'Saved circuits include component data and positions',
        'Load saved circuits to continue editing later',
      ],
    },
    {
      title: 'Adding Sub-Panels',
      content: [
        'Knowledge panels can have multiple sub-sections',
        'Three-Phase Systems has sub-panels for Basics, Fault Analysis, Power Flow, and Load Flow',
        'Sub-panels are organized hierarchically for easy navigation',
        'Each sub-panel can contain specialized tools and information',
        'Request new sub-panels for specific engineering topics',
      ],
    },
    {
      title: 'Customizing Content',
      content: [
        'All content is stored per-user in Supabase',
        'Search functionality works across all knowledge sections',
        'Filter by category to find specific formulas or calculations',
        'Export data for backup or sharing with team members',
      ],
      tips: [
        'Organize formulas by category for quick access',
        'Add detailed descriptions to make formulas searchable',
        'Save calculations with descriptive notes for future reference',
        'Use the search function to quickly find saved content',
        'Back up important formulas and calculations regularly',
      ],
    },
  ],
};

export const standardsInfo = {
  title: 'Standards & Codes Information',
  colorScheme: 'green' as const,
  sections: [
    {
      title: 'Standards Library Overview',
      content: 'Manage your electrical engineering standards including NEC (National Electric Code), IEEE Standards, IEC, ANSI, NEMA, and custom standards. Upload, organize, and search through all your compliance documents.',
    },
    {
      title: 'Uploading Standards Documents',
      content: [
        'Click "Upload Document" button in Standards section',
        'Select appropriate category (NEC, IEEE, IEC, ANSI, NEMA, Other)',
        'Enter document name (e.g., "IEEE 80-2000 Ground Grid")',
        'Add optional description for easier searching',
        'Upload PDF, DOC, DOCX, XLS, or XLSX files (max 50MB)',
        'Documents are stored securely in Supabase Storage',
      ],
    },
    {
      title: 'Organizing Documents',
      content: [
        'Use categories to group related standards',
        'Add tags for additional organization (coming soon)',
        'Create custom folders for project-specific standards',
        'Version control to track standard updates',
        'Link standards to specific projects',
      ],
    },
    {
      title: 'Working with Standards',
      content: [
        'View standards directly in the browser',
        'Search within documents for specific requirements',
        'Bookmark frequently referenced sections',
        'Export standards for offline reference',
        'Share standards with team members (coming soon)',
      ],
    },
    {
      title: 'QA/QC Standards Checker',
      content: [
        'Automated checking of drawing compliance',
        'Verifies title block information completeness',
        'Checks text sizes against standard requirements',
        'Validates drawing scale consistency',
        'Identifies unused layers and objects',
        'Flags non-standard layer naming conventions',
        'Compares drawing revisions and highlights differences',
        'Generates compliance reports for review',
      ],
    },
    {
      title: 'Files to Edit',
      content: [
        'Standards documents: Upload via Standards panel',
        'QA/QC rules: Configure in Drawing Annotations settings (coming soon)',
        'Compliance templates: Created in Project Manager',
        'Standard layer definitions: Set in drawing_annotations table',
      ],
      tips: [
        'Keep standards up-to-date with latest versions',
        'Use descriptive names including year and version number',
        'Create project-specific standards folders',
        'Regularly run QA/QC checks before final delivery',
        'Maintain a standards update log',
      ],
    },
  ],
};

export const equipmentInfo = {
  title: 'Equipment Library Information',
  colorScheme: 'orange' as const,
  sections: [
    {
      title: 'Equipment Library Overview',
      content: 'Comprehensive database of electrical equipment specifications, datasheets, and technical information. Organized into Static Equipment (transformers, transmission lines) and Rotating Equipment (generators, motors).',
    },
    {
      title: 'Adding Equipment Data',
      content: [
        'Click "Upload Document" in Equipment section',
        'Select equipment category (Transformers, Transmission Lines, Generators, Motors, etc.)',
        'Enter equipment manufacturer and model number',
        'Upload technical specifications and datasheets',
        'Add equipment photos and dimensional drawings',
        'Input key specifications (ratings, dimensions, weights)',
      ],
    },
    {
      title: 'Static Equipment',
      content: [
        'Transformers: Single-phase, three-phase, auto, zig-zag configurations',
        'Transmission Lines: Overhead, underground, specifications',
        'Shunt Reactors: Ratings, impedance data, specifications',
        'Shunt Capacitors: Voltage ratings, MVAR capacity, switching data',
      ],
    },
    {
      title: 'Rotating Equipment',
      content: [
        'Synchronous Generators: Salient pole, cylindrical (2-pole, 4-pole)',
        'Motors: Synchronous, squirrel cage, wound rotor',
        'Wind Machines: Turbine specifications, power curves',
      ],
    },
    {
      title: 'Equipment Sub-Panels',
      content: [
        'Each equipment type has dedicated sub-panels',
        'Transformer configurations show connection diagrams',
        'Generator panels include performance curves',
        'Motor sections contain starting and running characteristics',
        'All panels integrate with calculation tools',
      ],
    },
    {
      title: 'Adding New Equipment Types',
      content: [
        'Equipment types are defined in Dashboard component',
        'Add new items to equipmentInfo sections',
        'Create dedicated panel components for new types',
        'Upload manufacturer data and specifications',
        'Link equipment to projects for easy reference',
      ],
    },
    {
      title: 'Files to Edit',
      content: [
	      	'Equipment categories: DashboardShell.tsx menuSections',
        'Equipment panels: Create new components in src/components/',
        'Equipment data: Uploaded via Equipment upload interface',
        'Specifications: Stored in files table with category metadata',
      ],
      tips: [
        'Maintain manufacturer datasheets for all equipment',
        'Include multiple photos showing different views',
        'Keep equipment specifications current',
        'Link equipment to relevant projects',
        'Create equipment comparison sheets',
      ],
    },
  ],
};
