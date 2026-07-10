export interface DoclingConvertOptions {
  to_formats: ('json' | 'md' | 'html' | 'text' | 'doctags')[];
  table_mode?: 'fast' | 'accurate';
  image_export_mode?: 'placeholder' | 'embedded' | 'referenced';
  do_ocr?: boolean;
  force_ocr?: boolean;
  include_images?: boolean;
}

export interface DoclingConvertResponse {
  document: {
    md_content: string;
    json_content: DoclingDocument | null;
    html_content: string;
    text_content: string;
    doctags_content: string;
  };
  status: 'success' | 'partial_success' | 'skipped' | 'failure';
  processing_time: number;
  timings: Record<string, number>;
  errors: string[];
}

export interface DoclingDocument {
  schema_name: string;
  version: string;
  name: string;
  origin: {
    filename: string;
    mimetype: string;
  };
  furniture: DoclingFurniture;
  body: DoclingBody;
  groups: DoclingGroup[];
  tables: DoclingTable[];
  pictures: DoclingPicture[];
  key_value_items: unknown[];
  pages: Record<string, DoclingPage>;
}

export interface DoclingFurniture {
  self_ref: string;
  children: DoclingRef[];
}

export interface DoclingBody {
  self_ref: string;
  children: DoclingRef[];
}

export interface DoclingRef {
  $ref: string;
}

export interface DoclingGroup {
  self_ref: string;
  parent: DoclingRef;
  children: DoclingRef[];
  label: string;
  name: string;
}

export interface DoclingTable {
  self_ref: string;
  parent: DoclingRef;
  children: DoclingRef[];
  label: string;
  prov: DoclingProvenance[];
  captions: DoclingRef[];
  data: DoclingTableData;
}

export interface DoclingTableData {
  table_cells: DoclingTableCell[];
  num_rows: number;
  num_cols: number;
}

export interface DoclingTableCell {
  row_span: number;
  col_span: number;
  start_row_offset_idx: number;
  end_row_offset_idx: number;
  start_col_offset_idx: number;
  end_col_offset_idx: number;
  text: string;
  column_header: boolean;
  row_header: boolean;
  row_section: boolean;
}

export interface DoclingPicture {
  self_ref: string;
  parent: DoclingRef;
  children: DoclingRef[];
  label: string;
  prov: DoclingProvenance[];
  captions: DoclingRef[];
  data: {
    image?: {
      uri?: string;
      base64?: string;
      mimetype?: string;
    };
    classification?: string;
    description?: string;
  };
}

export interface DoclingProvenance {
  page_no: number;
  bbox: {
    l: number;
    t: number;
    r: number;
    b: number;
    coord_origin: string;
  };
  charspan: [number, number];
}

export interface DoclingPage {
  size: {
    width: number;
    height: number;
  };
  page_no: number;
}

export interface DoclingAsyncTaskResponse {
  task_id: string;
  status: string;
}

export interface DoclingTaskStatus {
  task_id: string;
  status: 'pending' | 'running' | 'success' | 'failure';
  progress?: number;
}
