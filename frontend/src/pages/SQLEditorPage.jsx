import React, { useState, useEffect } from 'react'
import {
  Card,
  Button,
  Space,
  Table,
  Tabs,
  Tag,
  message,
  Typography,
  Divider,
  Modal,
  Form,
  Input,
  Select,
  List,
  Collapse,
  Row,
  Col,
  Statistic,
} from 'antd'
import {
  PlayCircleOutlined,
  SaveOutlined,
  HistoryOutlined,
  FileTextOutlined,
  DatabaseOutlined,
  BarChartOutlined,
  ReloadOutlined,
  PlusOutlined,
  DeleteOutlined,
  CopyOutlined,
} from '@ant-design/icons'
import Editor from '@monaco-editor/react'
import axios from 'axios'
import ReactECharts from 'echarts-for-react'

const { Title, Text } = Typography
const { Option } = Select
const { TabPane } = Tabs
const { Panel } = Collapse

function SQLEditorPage({ datasetId, datasetInfo }) {
  const [sql, setSql] = useState('SELECT * FROM your_table LIMIT 100')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState([])
  const [templates, setTemplates] = useState([])
  const [templateModalVisible, setTemplateModalVisible] = useState(false)
  const [saveModalVisible, setSaveModalVisible] = useState(false)
  const [activeTab, setActiveTab] = useState('editor')
  const [explainResult, setExplainResult] = useState(null)
  const [chartOption, setChartOption] = useState(null)
  const [saveForm] = Form.useForm()

  useEffect(() => {
    if (datasetId) {
      setSql(`SELECT * FROM \`${datasetId}\` LIMIT 100`)
    }
    loadHistory()
    loadTemplates()
  }, [datasetId])

  const loadHistory = async () => {
    try {
      const response = await axios.get('http://localhost:8000/api/sql/history')
      setHistory(response.data.history)
    } catch (error) {
      console.error('加载历史失败')
    }
  }

  const loadTemplates = async () => {
    try {
      const response = await axios.get('http://localhost:8000/api/sql/templates')
      setTemplates(response.data.templates)
    } catch (error) {
      console.error('加载模板失败')
    }
  }

  const executeQuery = async (explain = false) => {
    setLoading(true)
    setResult(null)
    setExplainResult(null)
    setChartOption(null)
    
    try {
      const response = await axios.post('http://localhost:8000/api/sql/execute', {
        sql: sql,
        explain: explain,
        max_rows: 1000,
      })
      
      if (response.data.status === 'success') {
        setResult(response.data)
        if (response.data.explain_result) {
          setExplainResult(response.data.explain_result)
        }
        message.success(`查询成功，返回 ${response.data.row_count} 行`)
        loadHistory()
      } else {
        message.error(response.data.error || '查询失败')
      }
    } catch (error) {
      message.error('执行查询失败: ' + (error.response?.data?.detail || error.message))
    }
    setLoading(false)
  }

  const validateSql = async () => {
    try {
      const response = await axios.post('http://localhost:8000/api/sql/validate', { sql })
      if (response.data.valid) {
        message.success('SQL语法正确')
      } else {
        message.error('SQL语法错误: ' + response.data.error)
      }
    } catch (error) {
      message.error('验证失败')
    }
  }

  const applyTemplate = (template) => {
    let newSql = template.sql
    template.parameters.forEach(param => {
      if (param.name === 'table_name') {
        newSql = newSql.replace(`{${param.name}}`, datasetId || 'your_table')
      } else {
        newSql = newSql.replace(`{${param.name}}`, param.default || '')
      }
    })
    setSql(newSql)
    setTemplateModalVisible(false)
  }

  const saveAsDataset = async (values) => {
    if (!result || result.status !== 'success') {
      message.error('请先执行查询')
      return
    }
    
    try {
      await axios.post('http://localhost:8000/api/sql/save-dataset', {
        query_id: result.query_id,
        name: values.name,
      })
      message.success('保存成功')
      setSaveModalVisible(false)
      saveForm.resetFields()
    } catch (error) {
      message.error('保存失败')
    }
  }

  const generateChart = () => {
    if (!result || !result.data || result.data.length === 0) {
      message.error('没有数据可可视化')
      return
    }

    const columns = result.columns || Object.keys(result.data[0])
    const numericCols = columns.filter(col => {
      const val = result.data[0][col]
      return typeof val === 'number'
    })

    if (numericCols.length === 0) {
      message.error('没有可用于可视化的数值列')
      return
    }

    const xCol = columns[0]
    const yCol = numericCols[0]

    const option = {
      title: { text: '查询结果可视化' },
      tooltip: { trigger: 'axis' },
      xAxis: {
        type: 'category',
        data: result.data.map(d => d[xCol]).slice(0, 50)
      },
      yAxis: { type: 'value' },
      series: [{
        name: yCol,
        type: 'bar',
        data: result.data.map(d => d[yCol]).slice(0, 50)
      }]
    }

    setChartOption(option)
    setActiveTab('visualization')
  }

  const historyColumns = [
    {
      title: 'SQL',
      dataIndex: 'sql',
      key: 'sql',
      ellipsis: true,
      render: (text) => <Text copyable>{text.slice(0, 100)}...</Text>
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Tag color={status === 'success' ? 'green' : 'red'}>
          {status === 'success' ? '成功' : '失败'}
        </Tag>
      )
    },
    {
      title: '行数',
      dataIndex: 'row_count',
      key: 'row_count',
    },
    {
      title: '执行时间',
      dataIndex: 'execution_time',
      key: 'execution_time',
      render: (time) => `${(time * 1000).toFixed(2)} ms`
    },
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      render: (time) => new Date(time).toLocaleString()
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Button type="link" onClick={() => setSql(record.sql)}>
          复用
        </Button>
      )
    }
  ]

  const resultColumns = result?.columns?.map(col => ({
    title: col,
    dataIndex: col,
    key: col,
  })) || []

  return (
    <div>
      <Card
        title={
          <Space>
            <DatabaseOutlined />
            <span>SQL 编辑器</span>
          </Space>
        }
        extra={
          <Space>
            <Button icon={<FileTextOutlined />} onClick={() => setTemplateModalVisible(true)}>
              模板
            </Button>
            <Button icon={<HistoryOutlined />} onClick={() => setActiveTab('history')}>
              历史
            </Button>
            <Button icon={<ReloadOutlined />} onClick={validateSql}>
              验证
            </Button>
            <Button icon={<PlayCircleOutlined />} onClick={() => executeQuery(false)} loading={loading}>
              执行
            </Button>
            <Button icon={<PlayCircleOutlined />} onClick={() => executeQuery(true)} loading={loading}>
              执行并分析
            </Button>
          </Space>
        }
      >
        <div style={{ border: '1px solid #d9d9d9', borderRadius: 4, marginBottom: 16 }}>
          <Editor
            height="300px"
            defaultLanguage="sql"
            value={sql}
            onChange={(value) => setSql(value || '')}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              wordWrap: 'on',
            }}
          />
        </div>

        <Tabs activeKey={activeTab} onChange={setActiveTab}>
          <TabPane tab="结果" key="result">
            {result && (
              <div>
                <Row gutter={16} style={{ marginBottom: 16 }}>
                  <Col span={6}>
                    <Statistic title="返回行数" value={result.row_count} />
                  </Col>
                  <Col span={6}>
                    <Statistic 
                      title="执行时间" 
                      value={(result.execution_time * 1000).toFixed(2)} 
                      suffix="ms" 
                    />
                  </Col>
                  <Col span={6}>
                    <Statistic title="列数" value={result.columns?.length || 0} />
                  </Col>
                  <Col span={6}>
                    <Button 
                      type="primary" 
                      icon={<BarChartOutlined />} 
                      onClick={generateChart}
                      style={{ marginTop: 16 }}
                    >
                      可视化
                    </Button>
                    <Button 
                      icon={<SaveOutlined />} 
                      onClick={() => setSaveModalVisible(true)}
                      style={{ marginTop: 16, marginLeft: 8 }}
                    >
                      保存为数据集
                    </Button>
                  </Col>
                </Row>

                <Table
                  columns={resultColumns}
                  dataSource={result.data || []}
                  rowKey={(record, index) => index}
                  pagination={{ pageSize: 20 }}
                  scroll={{ x: 'max-content' }}
                  size="small"
                />
              </div>
            )}
            {!result && <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>执行查询后显示结果</div>}
          </TabPane>

          <TabPane tab="执行分析" key="explain">
            {explainResult && (
              <Collapse defaultActiveKey={['0']}>
                {explainResult.map((step, index) => (
                  <Panel header={step.step} key={index}>
                    <p><strong>描述:</strong> {step.description}</p>
                    {step.details && <p><strong>详情:</strong> {step.details}</p>}
                    {step.estimated_rows && <p><strong>预估行数:</strong> {step.estimated_rows}</p>}
                    {step.actual_rows && <p><strong>实际行数:</strong> {step.actual_rows}</p>}
                    {step.cost && <p><strong>复杂度:</strong> {step.cost}</p>}
                  </Panel>
                ))}
              </Collapse>
            )}
            {!explainResult && <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>使用"执行并分析"查看查询计划</div>}
          </TabPane>

          <TabPane tab="可视化" key="visualization">
            {chartOption && (
              <ReactECharts option={chartOption} style={{ height: 400 }} />
            )}
            {!chartOption && <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>点击"可视化"按钮生成图表</div>}
          </TabPane>

          <TabPane tab="查询历史" key="history">
            <Table
              columns={historyColumns}
              dataSource={history}
              rowKey="query_id"
              pagination={{ pageSize: 10 }}
            />
          </TabPane>
        </Tabs>
      </Card>

      <Modal
        title="SQL 模板"
        open={templateModalVisible}
        onCancel={() => setTemplateModalVisible(false)}
        footer={null}
        width={700}
      >
        <List
          dataSource={templates}
          renderItem={item => (
            <List.Item
              actions={[<Button type="link" onClick={() => applyTemplate(item)}>使用</Button>]}
            >
              <List.Item.Meta
                title={<Space><Tag color="blue">{item.category}</Tag>{item.name}</Space>}
                description={
                  <div>
                    <p>{item.description}</p>
                    <Text type="secondary" code>{item.sql.slice(0, 100)}...</Text>
                  </div>
                }
              />
            </List.Item>
          )}
        />
      </Modal>

      <Modal
        title="保存为数据集"
        open={saveModalVisible}
        onCancel={() => setSaveModalVisible(false)}
        footer={null}
      >
        <Form form={saveForm} layout="vertical" onFinish={saveAsDataset}>
          <Form.Item name="name" label="数据集名称" rules={[{ required: true }]}>
            <Input placeholder="请输入数据集名称" />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">保存</Button>
              <Button onClick={() => setSaveModalVisible(false)}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default SQLEditorPage
