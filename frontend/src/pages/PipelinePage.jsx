import React, { useState, useCallback, useRef, useEffect } from 'react'
import ReactFlow, {
  ReactFlowProvider,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  MiniMap,
  Handle,
  Position,
  MarkerType,
} from 'reactflow'
import 'reactflow/dist/style.css'
import {
  Card,
  Button,
  Space,
  Modal,
  Form,
  Input,
  Select,
  InputNumber,
  Switch,
  Table,
  Tag,
  message,
  Drawer,
  List,
  Popconfirm,
  Tooltip,
} from 'antd'
import {
  PlayCircleOutlined,
  SaveOutlined,
  FolderOpenOutlined,
  DeleteOutlined,
  PlusOutlined,
  SettingOutlined,
  FilterOutlined,
  ColumnHeightOutlined,
  SortAscendingOutlined,
  BarChartOutlined,
  TableOutlined,
  CalculatorOutlined,
  MergeCellsOutlined,
  ClearOutlined,
  RiseOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
} from '@ant-design/icons'
import axios from 'axios'

const nodeTypes = {
  input: InputNode,
  filter: FilterNode,
  select_columns: SelectColumnsNode,
  sort: SortNode,
  group_aggregate: GroupAggregateNode,
  pivot: PivotNode,
  compute_column: ComputeColumnNode,
  join: JoinNode,
  union: UnionNode,
  drop_duplicates: DropDuplicatesNode,
  fill_nulls: FillNullsNode,
  cast_type: CastTypeNode,
  rank: RankNode,
  moving_average: MovingAverageNode,
  cumulative_sum: CumulativeSumNode,
}

function InputNode({ data }) {
  return (
    <div style={{ padding: '10px', border: '2px solid #1890ff', borderRadius: '8px', background: '#e6f7ff', minWidth: '120px' }}>
      <div style={{ fontWeight: 'bold', color: '#1890ff' }}>数据源</div>
      <div style={{ fontSize: '12px', color: '#666' }}>{data.label}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

function FilterNode({ data }) {
  return (
    <div style={{ padding: '10px', border: '2px solid #52c41a', borderRadius: '8px', background: '#f6ffed', minWidth: '120px' }}>
      <Handle type="target" position={Position.Left} />
      <div style={{ fontWeight: 'bold', color: '#52c41a' }}>过滤行</div>
      <div style={{ fontSize: '12px', color: '#666' }}>{data.label}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

function SelectColumnsNode({ data }) {
  return (
    <div style={{ padding: '10px', border: '2px solid #faad14', borderRadius: '8px', background: '#fffbe6', minWidth: '120px' }}>
      <Handle type="target" position={Position.Left} />
      <div style={{ fontWeight: 'bold', color: '#faad14' }}>选择列</div>
      <div style={{ fontSize: '12px', color: '#666' }}>{data.label}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

function SortNode({ data }) {
  return (
    <div style={{ padding: '10px', border: '2px solid #eb2f96', borderRadius: '8px', background: '#fff0f6', minWidth: '120px' }}>
      <Handle type="target" position={Position.Left} />
      <div style={{ fontWeight: 'bold', color: '#eb2f96' }}>排序</div>
      <div style={{ fontSize: '12px', color: '#666' }}>{data.label}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

function GroupAggregateNode({ data }) {
  return (
    <div style={{ padding: '10px', border: '2px solid #722ed1', borderRadius: '8px', background: '#f9f0ff', minWidth: '120px' }}>
      <Handle type="target" position={Position.Left} />
      <div style={{ fontWeight: 'bold', color: '#722ed1' }}>分组聚合</div>
      <div style={{ fontSize: '12px', color: '#666' }}>{data.label}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

function PivotNode({ data }) {
  return (
    <div style={{ padding: '10px', border: '2px solid #13c2c2', borderRadius: '8px', background: '#e6fffb', minWidth: '120px' }}>
      <Handle type="target" position={Position.Left} />
      <div style={{ fontWeight: 'bold', color: '#13c2c2' }}>数据透视</div>
      <div style={{ fontSize: '12px', color: '#666' }}>{data.label}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

function ComputeColumnNode({ data }) {
  return (
    <div style={{ padding: '10px', border: '2px solid #fa8c16', borderRadius: '8px', background: '#fff7e6', minWidth: '120px' }}>
      <Handle type="target" position={Position.Left} />
      <div style={{ fontWeight: 'bold', color: '#fa8c16' }}>计算列</div>
      <div style={{ fontSize: '12px', color: '#666' }}>{data.label}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

function JoinNode({ data }) {
  return (
    <div style={{ padding: '10px', border: '2px solid #f5222d', borderRadius: '8px', background: '#fff1f0', minWidth: '120px' }}>
      <Handle type="target" position={Position.Left} style={{ top: 30 }} />
      <Handle type="target" position={Position.Left} style={{ top: 60 }} />
      <div style={{ fontWeight: 'bold', color: '#f5222d' }}>数据合并</div>
      <div style={{ fontSize: '12px', color: '#666' }}>{data.label}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

function UnionNode({ data }) {
  return (
    <div style={{ padding: '10px', border: '2px solid #a0d911', borderRadius: '8px', background: '#fcffe6', minWidth: '120px' }}>
      <Handle type="target" position={Position.Left} style={{ top: 30 }} />
      <Handle type="target" position={Position.Left} style={{ top: 60 }} />
      <div style={{ fontWeight: 'bold', color: '#a0d911' }}>数据联合</div>
      <div style={{ fontSize: '12px', color: '#666' }}>{data.label}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

function DropDuplicatesNode({ data }) {
  return (
    <div style={{ padding: '10px', border: '2px solid #1890ff', borderRadius: '8px', background: '#e6f7ff', minWidth: '120px' }}>
      <Handle type="target" position={Position.Left} />
      <div style={{ fontWeight: 'bold', color: '#1890ff' }}>去重</div>
      <div style={{ fontSize: '12px', color: '#666' }}>{data.label}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

function FillNullsNode({ data }) {
  return (
    <div style={{ padding: '10px', border: '2px solid #1890ff', borderRadius: '8px', background: '#e6f7ff', minWidth: '120px' }}>
      <Handle type="target" position={Position.Left} />
      <div style={{ fontWeight: 'bold', color: '#1890ff' }}>填充空值</div>
      <div style={{ fontSize: '12px', color: '#666' }}>{data.label}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

function CastTypeNode({ data }) {
  return (
    <div style={{ padding: '10px', border: '2px solid #1890ff', borderRadius: '8px', background: '#e6f7ff', minWidth: '120px' }}>
      <Handle type="target" position={Position.Left} />
      <div style={{ fontWeight: 'bold', color: '#1890ff' }}>类型转换</div>
      <div style={{ fontSize: '12px', color: '#666' }}>{data.label}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

function RankNode({ data }) {
  return (
    <div style={{ padding: '10px', border: '2px solid #1890ff', borderRadius: '8px', background: '#e6f7ff', minWidth: '120px' }}>
      <Handle type="target" position={Position.Left} />
      <div style={{ fontWeight: 'bold', color: '#1890ff' }}>排名</div>
      <div style={{ fontSize: '12px', color: '#666' }}>{data.label}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

function MovingAverageNode({ data }) {
  return (
    <div style={{ padding: '10px', border: '2px solid #1890ff', borderRadius: '8px', background: '#e6f7ff', minWidth: '120px' }}>
      <Handle type="target" position={Position.Left} />
      <div style={{ fontWeight: 'bold', color: '#1890ff' }}>移动平均</div>
      <div style={{ fontSize: '12px', color: '#666' }}>{data.label}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

function CumulativeSumNode({ data }) {
  return (
    <div style={{ padding: '10px', border: '2px solid #1890ff', borderRadius: '8px', background: '#e6f7ff', minWidth: '120px' }}>
      <Handle type="target" position={Position.Left} />
      <div style={{ fontWeight: 'bold', color: '#1890ff' }}>累计求和</div>
      <div style={{ fontSize: '12px', color: '#666' }}>{data.label}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

const nodePalette = [
  { type: 'filter', label: '过滤行', icon: <FilterOutlined /> },
  { type: 'select_columns', label: '选择列', icon: <ColumnHeightOutlined /> },
  { type: 'sort', label: '排序', icon: <SortAscendingOutlined /> },
  { type: 'group_aggregate', label: '分组聚合', icon: <BarChartOutlined /> },
  { type: 'pivot', label: '数据透视', icon: <TableOutlined /> },
  { type: 'compute_column', label: '计算列', icon: <CalculatorOutlined /> },
  { type: 'join', label: '数据合并', icon: <MergeCellsOutlined /> },
  { type: 'union', label: '数据联合', icon: <MergeCellsOutlined /> },
  { type: 'drop_duplicates', label: '去重', icon: <ClearOutlined /> },
  { type: 'fill_nulls', label: '填充空值', icon: <ClearOutlined /> },
  { type: 'cast_type', label: '类型转换', icon: <SettingOutlined /> },
  { type: 'rank', label: '排名', icon: <RiseOutlined /> },
  { type: 'moving_average', label: '移动平均', icon: <ArrowUpOutlined /> },
  { type: 'cumulative_sum', label: '累计求和', icon: <ArrowDownOutlined /> },
]

function PipelineEditor({ datasetId, datasetInfo, columns }) {
  const reactFlowWrapper = useRef(null)
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [reactFlowInstance, setReactFlowInstance] = useState(null)
  const [selectedNode, setSelectedNode] = useState(null)
  const [configDrawerVisible, setConfigDrawerVisible] = useState(false)
  const [previewDrawerVisible, setPreviewDrawerVisible] = useState(false)
  const [previewData, setPreviewData] = useState({})
  const [saveModalVisible, setSaveModalVisible] = useState(false)
  const [loadModalVisible, setLoadModalVisible] = useState(false)
  const [pipelines, setPipelines] = useState([])
  const [form] = Form.useForm()
  const [saveForm] = Form.useForm()
  const [executionOrder, setExecutionOrder] = useState([])

  useEffect(() => {
    if (datasetId && columns) {
      const initialNodes = [
        {
          id: 'input',
          type: 'input',
          position: { x: 50, y: 200 },
          data: { label: datasetInfo?.filename || '数据集' },
        },
      ]
      setNodes(initialNodes)
      setEdges([])
    }
  }, [datasetId])

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge({ ...params, markerEnd: { type: MarkerType.ArrowClosed } }, eds)),
    [setEdges]
  )

  const onDragOver = useCallback((event) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (event) => {
      event.preventDefault()

      const type = event.dataTransfer.getData('application/reactflow')

      if (!type) {
        return
      }

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })

      const newNode = {
        id: `${type}_${Date.now()}`,
        type,
        position,
        data: { label: nodePalette.find(n => n.type === type)?.label || type, config: {}, enabled: true },
      }

      setNodes((nds) => nds.concat(newNode))
    },
    [reactFlowInstance, setNodes]
  )

  const onDragStart = (event, nodeType) => {
    event.dataTransfer.setData('application/reactflow', nodeType)
    event.dataTransfer.effectAllowed = 'move'
  }

  const onNodeClick = useCallback((_, node) => {
    if (node.type !== 'input') {
      setSelectedNode(node)
      form.setFieldsValue({
        enabled: node.data.enabled,
        ...node.data.config,
      })
      setConfigDrawerVisible(true)
    }
  }, [form])

  const saveNodeConfig = () => {
    form.validateFields().then((values) => {
      const { enabled, ...config } = values
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === selectedNode.id) {
            return {
              ...node,
              data: {
                ...node.data,
                enabled,
                config,
                label: values.label || node.data.label,
              },
            }
          }
          return node
        })
      )
      setConfigDrawerVisible(false)
      message.success('配置已保存')
    })
  }

  const executePipeline = async () => {
    try {
      const response = await axios.post('http://localhost:8000/api/pipeline/execute', {
        dataset_id: datasetId,
        nodes: nodes.map(n => ({
          id: n.id,
          type: n.type,
          config: n.data.config,
          enabled: n.data.enabled,
        })),
        edges: edges.map(e => [e.source, e.target]),
        input_node_id: 'input',
      })

      setPreviewData(response.data.previews)
      setExecutionOrder(response.data.execution_order)
      setPreviewDrawerVisible(true)
      message.success('管道执行成功')
    } catch (error) {
      message.error('管道执行失败: ' + error.response?.data?.detail || error.message)
    }
  }

  const savePipeline = () => {
    saveForm.validateFields().then(async (values) => {
      try {
        const response = await axios.post('http://localhost:8000/api/pipeline/save', {
          name: values.name,
          description: values.description,
          dataset_id: datasetId,
          nodes: nodes.map(n => ({
            id: n.id,
            type: n.type,
            config: n.data.config,
            enabled: n.data.enabled,
            data: n.data,
            position: n.position,
          })),
          edges: edges.map(e => [e.source, e.target]),
        })
        message.success('管道保存成功')
        setSaveModalVisible(false)
        saveForm.resetFields()
      } catch (error) {
        message.error('保存失败: ' + error.message)
      }
    })
  }

  const loadPipelines = async () => {
    try {
      const response = await axios.get('http://localhost:8000/api/pipeline/list', {
        params: { dataset_id: datasetId },
      })
      setPipelines(response.data.pipelines)
      setLoadModalVisible(true)
    } catch (error) {
      message.error('加载失败: ' + error.message)
    }
  }

  const loadPipeline = (pipeline) => {
    const loadedNodes = pipeline.nodes.map(n => ({
      id: n.id,
      type: n.type,
      position: n.position || { x: 100, y: 200 },
      data: n.data || { label: n.type, config: n.config, enabled: n.enabled },
    }))
    setNodes(loadedNodes)
    setEdges(pipeline.edges.map(([source, target]) => ({
      id: `${source}-${target}`,
      source,
      target,
      markerEnd: { type: MarkerType.ArrowClosed },
    })))
    setLoadModalVisible(false)
    message.success('管道加载成功')
  }

  const deleteNode = () => {
    if (selectedNode && selectedNode.type !== 'input') {
      setNodes((nds) => nds.filter(n => n.id !== selectedNode.id))
      setEdges((eds) => eds.filter(e => e.source !== selectedNode.id && e.target !== selectedNode.id))
      setConfigDrawerVisible(false)
      message.success('节点已删除')
    }
  }

  const renderNodeConfig = () => {
    if (!selectedNode) return null

    const commonFields = (
      <>
        <Form.Item name="label" label="节点名称">
          <Input placeholder="请输入节点名称" />
        </Form.Item>
        <Form.Item name="enabled" label="启用" valuePropName="checked">
          <Switch defaultChecked />
        </Form.Item>
      </>
    )

    switch (selectedNode.type) {
      case 'filter':
        return (
          <>
            {commonFields}
            <Form.Item label="过滤条件">
              <Form.List name="conditions">
                {(fields, { add, remove }) => (
                  <>
                    {fields.map(({ key, name, ...restField }) => (
                      <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                        <Form.Item
                          {...restField}
                          name={[name, 'column']}
                          rules={[{ required: true, message: '请选择列' }]}
                        >
                          <Select placeholder="选择列" style={{ width: 120 }}>
                            {columns?.map(col => (
                              <Select.Option key={col} value={col}>{col}</Select.Option>
                            ))}
                          </Select>
                        </Form.Item>
                        <Form.Item
                          {...restField}
                          name={[name, 'operator']}
                          rules={[{ required: true, message: '请选择操作符' }]}
                        >
                          <Select placeholder="操作符" style={{ width: 120 }}>
                            <Select.Option value="==">等于</Select.Option>
                            <Select.Option value="!=">不等于</Select.Option>
                            <Select.Option value=">">大于</Select.Option>
                            <Select.Option value=">=">大于等于</Select.Option>
                            <Select.Option value="<">小于</Select.Option>
                            <Select.Option value="<=">小于等于</Select.Option>
                            <Select.Option value="contains">包含</Select.Option>
                            <Select.Option value="not_contains">不包含</Select.Option>
                            <Select.Option value="in">在列表中</Select.Option>
                            <Select.Option value="is_null">为空</Select.Option>
                            <Select.Option value="is_not_null">不为空</Select.Option>
                          </Select>
                        </Form.Item>
                        <Form.Item
                          {...restField}
                          name={[name, 'value']}
                        >
                          <Input placeholder="值" style={{ width: 150 }} />
                        </Form.Item>
                        <DeleteOutlined onClick={() => remove(name)} style={{ color: '#ff4d4f', cursor: 'pointer' }} />
                      </Space>
                    ))}
                    <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                      添加条件
                    </Button>
                  </>
                )}
              </Form.List>
            </Form.Item>
          </>
        )
      case 'select_columns':
        return (
          <>
            {commonFields}
            <Form.Item name="columns" label="选择列">
              <Select mode="multiple" placeholder="选择要保留的列">
                {columns?.map(col => (
                  <Select.Option key={col} value={col}>{col}</Select.Option>
                ))}
              </Select>
            </Form.Item>
          </>
        )
      case 'sort':
        return (
          <>
            {commonFields}
            <Form.Item label="排序条件">
              <Form.List name="columns">
                {(fields, { add, remove }) => (
                  <>
                    {fields.map(({ key, name, ...restField }) => (
                      <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                        <Form.Item
                          {...restField}
                          name={[name]}
                          rules={[{ required: true, message: '请选择列' }]}
                        >
                          <Select placeholder="选择列" style={{ width: 150 }}>
                            {columns?.map(col => (
                              <Select.Option key={col} value={col}>{col}</Select.Option>
                            ))}
                          </Select>
                        </Form.Item>
                        <DeleteOutlined onClick={() => remove(name)} style={{ color: '#ff4d4f', cursor: 'pointer' }} />
                      </Space>
                    ))}
                    <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                      添加排序列
                    </Button>
                  </>
                )}
              </Form.List>
            </Form.Item>
            <Form.Item name="ascending" label="排序方式">
              <Select>
                <Select.Option value={true}>升序</Select.Option>
                <Select.Option value={false}>降序</Select.Option>
              </Select>
            </Form.Item>
          </>
        )
      case 'group_aggregate':
        return (
          <>
            {commonFields}
            <Form.Item name="group_columns" label="分组列">
              <Select mode="multiple" placeholder="选择分组列">
                {columns?.map(col => (
                  <Select.Option key={col} value={col}>{col}</Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item label="聚合函数">
              <Form.List name="aggregations">
                {(fields, { add, remove }) => (
                  <>
                    {fields.map(({ key, name, ...restField }) => (
                      <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                        <Form.Item
                          {...restField}
                          name={[name, 'column']}
                          rules={[{ required: true, message: '请选择列' }]}
                        >
                          <Select placeholder="选择列" style={{ width: 120 }}>
                            {columns?.map(col => (
                              <Select.Option key={col} value={col}>{col}</Select.Option>
                            ))}
                          </Select>
                        </Form.Item>
                        <Form.Item
                          {...restField}
                          name={[name, 'function']}
                          rules={[{ required: true, message: '请选择函数' }]}
                        >
                          <Select placeholder="函数" style={{ width: 100 }}>
                            <Select.Option value="sum">求和</Select.Option>
                            <Select.Option value="avg">平均</Select.Option>
                            <Select.Option value="count">计数</Select.Option>
                            <Select.Option value="max">最大值</Select.Option>
                            <Select.Option value="min">最小值</Select.Option>
                            <Select.Option value="median">中位数</Select.Option>
                          </Select>
                        </Form.Item>
                        <Form.Item
                          {...restField}
                          name={[name, 'alias']}
                        >
                          <Input placeholder="别名" style={{ width: 100 }} />
                        </Form.Item>
                        <DeleteOutlined onClick={() => remove(name)} style={{ color: '#ff4d4f', cursor: 'pointer' }} />
                      </Space>
                    ))}
                    <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                      添加聚合
                    </Button>
                  </>
                )}
              </Form.List>
            </Form.Item>
          </>
        )
      case 'pivot':
        return (
          <>
            {commonFields}
            <Form.Item name="rows" label="行">
              <Select mode="multiple" placeholder="选择行字段">
                {columns?.map(col => (
                  <Select.Option key={col} value={col}>{col}</Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="columns" label="列">
              <Select mode="multiple" placeholder="选择列字段">
                {columns?.map(col => (
                  <Select.Option key={col} value={col}>{col}</Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="values" label="值">
              <Select mode="multiple" placeholder="选择值字段">
                {columns?.map(col => (
                  <Select.Option key={col} value={col}>{col}</Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="agg_func" label="聚合函数">
              <Select>
                <Select.Option value="sum">求和</Select.Option>
                <Select.Option value="mean">平均</Select.Option>
                <Select.Option value="count">计数</Select.Option>
              </Select>
            </Form.Item>
          </>
        )
      case 'compute_column':
        return (
          <>
            {commonFields}
            <Form.Item name="new_column" label="新列名" rules={[{ required: true }]}>
              <Input placeholder="请输入新列名" />
            </Form.Item>
            <Form.Item name="expression" label="表达式" rules={[{ required: true }]}>
              <Input.TextArea
                rows={4}
                placeholder="例如: 列名1 + 列名2 或 np.log(列名)"
              />
            </Form.Item>
          </>
        )
      case 'join':
        return (
          <>
            {commonFields}
            <Form.Item name="how" label="连接方式">
              <Select>
                <Select.Option value="inner">内连接</Select.Option>
                <Select.Option value="left">左连接</Select.Option>
                <Select.Option value="right">右连接</Select.Option>
                <Select.Option value="outer">外连接</Select.Option>
              </Select>
            </Form.Item>
            <Form.Item name="left_on" label="左表连接列">
              <Select mode="multiple" placeholder="选择左表列">
                {columns?.map(col => (
                  <Select.Option key={col} value={col}>{col}</Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="right_on" label="右表连接列">
              <Select mode="multiple" placeholder="选择右表列">
                {columns?.map(col => (
                  <Select.Option key={col} value={col}>{col}</Select.Option>
                ))}
              </Select>
            </Form.Item>
          </>
        )
      case 'union':
        return (
          <>
            {commonFields}
            <Form.Item name="ignore_index" label="重置索引" valuePropName="checked">
              <Switch defaultChecked />
            </Form.Item>
          </>
        )
      case 'drop_duplicates':
        return (
          <>
            {commonFields}
            <Form.Item name="subset" label="去重列">
              <Select mode="multiple" placeholder="留空则所有列">
                {columns?.map(col => (
                  <Select.Option key={col} value={col}>{col}</Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="keep" label="保留">
              <Select>
                <Select.Option value="first">第一个</Select.Option>
                <Select.Option value="last">最后一个</Select.Option>
                <Select.Option value={false}>不保留</Select.Option>
              </Select>
            </Form.Item>
          </>
        )
      case 'fill_nulls':
        return (
          <>
            {commonFields}
            <Form.Item name="strategy" label="填充策略">
              <Select>
                <Select.Option value="value">指定值</Select.Option>
                <Select.Option value="mean">均值</Select.Option>
                <Select.Option value="median">中位数</Select.Option>
                <Select.Option value="mode">众数</Select.Option>
                <Select.Option value="ffill">前向填充</Select.Option>
                <Select.Option value="bfill">后向填充</Select.Option>
              </Select>
            </Form.Item>
            <Form.Item name="value" label="填充值">
              <Input placeholder="当策略为指定值时" />
            </Form.Item>
            <Form.Item name="columns" label="目标列">
              <Select mode="multiple" placeholder="留空则所有列">
                {columns?.map(col => (
                  <Select.Option key={col} value={col}>{col}</Select.Option>
                ))}
              </Select>
            </Form.Item>
          </>
        )
      case 'cast_type':
        return (
          <>
            {commonFields}
            <Form.Item name="column" label="列" rules={[{ required: true }]}>
              <Select placeholder="选择列">
                {columns?.map(col => (
                  <Select.Option key={col} value={col}>{col}</Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="dtype" label="目标类型" rules={[{ required: true }]}>
              <Select>
                <Select.Option value="int">整数</Select.Option>
                <Select.Option value="float">浮点数</Select.Option>
                <Select.Option value="string">字符串</Select.Option>
                <Select.Option value="date">日期</Select.Option>
                <Select.Option value="boolean">布尔</Select.Option>
              </Select>
            </Form.Item>
          </>
        )
      case 'rank':
        return (
          <>
            {commonFields}
            <Form.Item name="column" label="排序列" rules={[{ required: true }]}>
              <Select placeholder="选择列">
                {columns?.map(col => (
                  <Select.Option key={col} value={col}>{col}</Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="rank_column" label="排名字段名">
              <Input placeholder="默认: rank" />
            </Form.Item>
            <Form.Item name="ascending" label="排序方式">
              <Select>
                <Select.Option value={true}>升序</Select.Option>
                <Select.Option value={false}>降序</Select.Option>
              </Select>
            </Form.Item>
            <Form.Item name="group_by" label="分组列">
              <Select mode="multiple" placeholder="可选">
                {columns?.map(col => (
                  <Select.Option key={col} value={col}>{col}</Select.Option>
                ))}
              </Select>
            </Form.Item>
          </>
        )
      case 'moving_average':
        return (
          <>
            {commonFields}
            <Form.Item name="column" label="计算列" rules={[{ required: true }]}>
              <Select placeholder="选择列">
                {columns?.map(col => (
                  <Select.Option key={col} value={col}>{col}</Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="window" label="窗口大小">
              <InputNumber min={1} defaultValue={5} />
            </Form.Item>
            <Form.Item name="ma_column" label="输出列名">
              <Input placeholder="默认: 列名_ma_窗口大小" />
            </Form.Item>
            <Form.Item name="group_by" label="分组列">
              <Select mode="multiple" placeholder="可选">
                {columns?.map(col => (
                  <Select.Option key={col} value={col}>{col}</Select.Option>
                ))}
              </Select>
            </Form.Item>
          </>
        )
      case 'cumulative_sum':
        return (
          <>
            {commonFields}
            <Form.Item name="column" label="计算列" rules={[{ required: true }]}>
              <Select placeholder="选择列">
                {columns?.map(col => (
                  <Select.Option key={col} value={col}>{col}</Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="cumsum_column" label="输出列名">
              <Input placeholder="默认: 列名_cumsum" />
            </Form.Item>
            <Form.Item name="group_by" label="分组列">
              <Select mode="multiple" placeholder="可选">
                {columns?.map(col => (
                  <Select.Option key={col} value={col}>{col}</Select.Option>
                ))}
              </Select>
            </Form.Item>
          </>
        )
      default:
        return commonFields
    }
  }

  return (
    <div style={{ height: 'calc(100vh - 200px)', display: 'flex' }}>
      <div style={{ width: 200, padding: 10, borderRight: '1px solid #eee' }}>
        <h4>节点面板</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {nodePalette.map((node) => (
            <div
              key={node.type}
              className="dndnode"
              draggable
              onDragStart={(e) => onDragStart(e, node.type)}
              style={{
                padding: '8px 12px',
                border: '1px solid #d9d9d9',
                borderRadius: '4px',
                cursor: 'grab',
                background: '#fff',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              {node.icon}
              <span>{node.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex: 1 }}>
        <div style={{ padding: 10, borderBottom: '1px solid #eee' }}>
          <Space>
            <Button type="primary" icon={<PlayCircleOutlined />} onClick={executePipeline}>
              执行管道
            </Button>
            <Button icon={<SaveOutlined />} onClick={() => setSaveModalVisible(true)}>
              保存管道
            </Button>
            <Button icon={<FolderOpenOutlined />} onClick={loadPipelines}>
              加载管道
            </Button>
          </Space>
        </div>

        <div ref={reactFlowWrapper} style={{ height: '100%' }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={setReactFlowInstance}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            fitView
          >
            <Background />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </div>
      </div>

      <Drawer
        title="节点配置"
        placement="right"
        width={400}
        open={configDrawerVisible}
        onClose={() => setConfigDrawerVisible(false)}
        extra={
          <Space>
            <Popconfirm title="确定删除该节点？" onConfirm={deleteNode} okText="确定" cancelText="取消">
              <Button danger icon={<DeleteOutlined />}>删除</Button>
            </Popconfirm>
            <Button type="primary" onClick={saveNodeConfig}>保存</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          {renderNodeConfig()}
        </Form>
      </Drawer>

      <Drawer
        title="执行结果预览"
        placement="right"
        width={800}
        open={previewDrawerVisible}
        onClose={() => setPreviewDrawerVisible(false)}
      >
        <List
          dataSource={executionOrder}
          renderItem={(nodeId) => {
            const data = previewData[nodeId]
            if (!data) return null
            return (
              <List.Item>
                <Card
                  size="small"
                  style={{ width: '100%' }}
                  title={
                    <Space>
                      <span>{nodeId}</span>
                      <Tag color={data.enabled ? 'green' : 'default'}>{data.enabled ? '已启用' : '已禁用'}</Tag>
                      <span style={{ color: '#666', fontSize: '12px' }}>
                        {data.rows} 行 × {data.columns} 列
                      </span>
                    </Space>
                  }
                >
                  <Table
                    size="small"
                    dataSource={data.preview}
                    columns={data.column_names?.map(col => ({ title: col, dataIndex: col, key: col }))}
                    pagination={{ pageSize: 5 }}
                    scroll={{ x: 'max-content' }}
                  />
                </Card>
              </List.Item>
            )
          }}
        />
      </Drawer>

      <Modal
        title="保存管道"
        open={saveModalVisible}
        onCancel={() => setSaveModalVisible(false)}
        footer={null}
      >
        <Form form={saveForm} layout="vertical">
          <Form.Item name="name" label="管道名称" rules={[{ required: true }]}>
            <Input placeholder="请输入管道名称" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} placeholder="请输入描述" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" onClick={savePipeline} block>保存</Button>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="加载管道"
        open={loadModalVisible}
        onCancel={() => setLoadModalVisible(false)}
        footer={null}
        width={600}
      >
        {pipelines.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#999' }}>
            暂无保存的管道
          </div>
        ) : (
          <List
            dataSource={pipelines}
            renderItem={(pipeline) => (
              <List.Item
                actions={[
                  <Button type="link" onClick={() => loadPipeline(pipeline)}>加载</Button>,
                ]}
              >
                <List.Item.Meta
                  title={pipeline.name}
                  description={pipeline.description || `创建于 ${pipeline.created_at}`}
                />
              </List.Item>
            )}
          />
        )}
      </Modal>
    </div>
  )
}

export default function PipelinePage({ datasetId, datasetInfo }) {
  const [columns, setColumns] = useState([])

  useEffect(() => {
    if (datasetId && datasetInfo?.columns) {
      setColumns(datasetInfo.columns)
    }
  }, [datasetId, datasetInfo])

  if (!datasetId) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', color: '#999' }}>
        请先导入数据
      </div>
    )
  }

  return (
    <ReactFlowProvider>
      <PipelineEditor datasetId={datasetId} datasetInfo={datasetInfo} columns={columns} />
    </ReactFlowProvider>
  )
}
