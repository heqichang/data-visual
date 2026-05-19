import React, { useState, useEffect, useRef } from 'react'
import {
  Card,
  Table,
  Button,
  Space,
  Modal,
  Form,
  Input,
  Select,
  InputNumber,
  Tag,
  message,
  Typography,
  Divider,
  Row,
  Col,
  Statistic,
} from 'antd'
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  StopOutlined,
  ReloadOutlined,
  PlusOutlined,
  DeleteOutlined,
  SettingOutlined,
  DashboardOutlined,
} from '@ant-design/icons'
import axios from 'axios'
import ReactECharts from 'echarts-for-react'

const { Title, Text } = Typography
const { Option } = Select
const { TextArea } = Input

function StreamingPage({ datasetId }) {
  const [streams, setStreams] = useState([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [selectedStream, setSelectedStream] = useState(null)
  const [streamData, setStreamData] = useState([])
  const [chartData, setChartData] = useState({ categories: [], data: [] })
  const wsRef = useRef(null)
  const [form] = Form.useForm()

  useEffect(() => {
    loadStreams()
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [])

  const loadStreams = async () => {
    setLoading(true)
    try {
      const response = await axios.get('http://localhost:8000/api/streaming/streams')
      setStreams(response.data.streams)
    } catch (error) {
      message.error('加载数据流失败')
    }
    setLoading(false)
  }

  const createStream = async (values) => {
    try {
      const sourceConfig = {}
      
      if (values.source_type === 'simulation') {
        sourceConfig.interval = values.interval || 1
        sourceConfig.data_template = values.data_template ? JSON.parse(values.data_template) : {
          value: { type: 'int', min: 0, max: 100 },
          category: { type: 'choice', choices: ['A', 'B', 'C'] }
        }
      } else if (values.source_type === 'websocket') {
        sourceConfig.url = values.websocket_url
      } else if (values.source_type === 'replay') {
        sourceConfig.dataset_id = datasetId
        sourceConfig.speed = values.replay_speed || 1
        sourceConfig.timestamp_column = values.timestamp_column
      }

      const response = await axios.post('http://localhost:8000/api/streaming/streams', {
        source_type: values.source_type,
        source_config: sourceConfig,
        name: values.name,
        description: values.description,
        window_config: {
          window_type: 'sliding',
          size: values.window_size || 60,
          unit: values.window_unit || 'seconds'
        }
      })
      
      message.success('数据流创建成功')
      setModalVisible(false)
      form.resetFields()
      loadStreams()
    } catch (error) {
      message.error('创建数据流失败')
    }
  }

  const startStream = async (streamId) => {
    try {
      await axios.post(`http://localhost:8000/api/streaming/streams/${streamId}/start`)
      message.success('数据流已启动')
      loadStreams()
      connectWebSocket(streamId)
    } catch (error) {
      message.error('启动数据流失败')
    }
  }

  const pauseStream = async (streamId) => {
    try {
      await axios.post(`http://localhost:8000/api/streaming/streams/${streamId}/pause`)
      message.success('数据流已暂停')
      loadStreams()
    } catch (error) {
      message.error('暂停数据流失败')
    }
  }

  const resumeStream = async (streamId) => {
    try {
      await axios.post(`http://localhost:8000/api/streaming/streams/${streamId}/resume`)
      message.success('数据流已恢复')
      loadStreams()
    } catch (error) {
      message.error('恢复数据流失败')
    }
  }

  const stopStream = async (streamId) => {
    try {
      await axios.post(`http://localhost:8000/api/streaming/streams/${streamId}/stop`)
      message.success('数据流已停止')
      loadStreams()
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    } catch (error) {
      message.error('停止数据流失败')
    }
  }

  const deleteStream = async (streamId) => {
    try {
      await axios.delete(`http://localhost:8000/api/streaming/streams/${streamId}`)
      message.success('数据流已删除')
      loadStreams()
      if (selectedStream === streamId) {
        setSelectedStream(null)
        setStreamData([])
        setChartData({ categories: [], data: [] })
      }
    } catch (error) {
      message.error('删除数据流失败')
    }
  }

  const connectWebSocket = (streamId) => {
    if (wsRef.current) {
      wsRef.current.close()
    }

    const ws = new WebSocket(`ws://localhost:8000/api/streaming/ws/${streamId}`)
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      if (data.type === 'new_record') {
        setStreamData(prev => [data.data, ...prev].slice(0, 100))
        
        setChartData(prev => {
          const newCategories = [...prev.categories, data.data._timestamp.slice(11, 19)].slice(-50)
          const value = data.data.value !== undefined ? data.data.value : (data.data.amount || data.data.sales || 0)
          const newData = [...prev.data, value].slice(-50)
          return { categories: newCategories, data: newData }
        })
      }
    }

    ws.onclose = () => {
      console.log('WebSocket closed')
    }

    wsRef.current = ws
  }

  const viewStream = async (stream) => {
    setSelectedStream(stream.stream_id)
    setStreamData([])
    setChartData({ categories: [], data: [] })
    
    if (stream.status === 'running') {
      connectWebSocket(stream.stream_id)
    }
    
    try {
      const response = await axios.get(`http://localhost:8000/api/streaming/streams/${stream.stream_id}/data`, {
        params: { limit: 50 }
      })
      setStreamData(response.data.data)
    } catch (error) {
      console.error('加载数据失败')
    }
  }

  const getStatusTag = (status) => {
    const colors = {
      running: 'green',
      stopped: 'default',
      paused: 'orange',
      error: 'red'
    }
    const labels = {
      running: '运行中',
      stopped: '已停止',
      paused: '已暂停',
      error: '错误'
    }
    return <Tag color={colors[status] || 'default'}>{labels[status] || status}</Tag>
  }

  const columns = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '类型',
      dataIndex: 'source_type',
      key: 'source_type',
      render: (type) => {
        const types = {
          simulation: '模拟数据',
          websocket: 'WebSocket',
          kafka: 'Kafka',
          mqtt: 'MQTT',
          replay: '数据回放'
        }
        return types[type] || type
      }
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status) => getStatusTag(status)
    },
    {
      title: '记录数',
      dataIndex: 'total_records',
      key: 'total_records',
    },
    {
      title: '窗口大小',
      dataIndex: ['window_config', 'size'],
      key: 'window_size',
      render: (size, record) => `${size} ${record.window_config?.unit || 's'}`
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Space size="small">
          <Button type="link" onClick={() => viewStream(record)}>
            查看
          </Button>
          {record.status === 'stopped' && (
            <Button type="link" icon={<PlayCircleOutlined />} onClick={() => startStream(record.stream_id)}>
              启动
            </Button>
          )}
          {record.status === 'running' && (
            <Button type="link" icon={<PauseCircleOutlined />} onClick={() => pauseStream(record.stream_id)}>
              暂停
            </Button>
          )}
          {record.status === 'paused' && (
            <Button type="link" icon={<ReloadOutlined />} onClick={() => resumeStream(record.stream_id)}>
              恢复
            </Button>
          )}
          {(record.status === 'running' || record.status === 'paused') && (
            <Button type="link" icon={<StopOutlined />} onClick={() => stopStream(record.stream_id)}>
              停止
            </Button>
          )}
          <Button type="link" danger icon={<DeleteOutlined />} onClick={() => deleteStream(record.stream_id)}>
            删除
          </Button>
        </Space>
      )
    }
  ]

  const chartOption = {
    title: { text: '实时数据趋势' },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: chartData.categories
    },
    yAxis: { type: 'value' },
    series: [{
      data: chartData.data,
      type: 'line',
      smooth: true,
      areaStyle: {}
    }]
  }

  return (
    <div>
      <Card
        title={
          <Space>
            <DashboardOutlined />
            <span>实时数据流管理</span>
          </Space>
        }
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalVisible(true)}>
            创建数据流
          </Button>
        }
      >
        <Table
          columns={columns}
          dataSource={streams}
          rowKey="stream_id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      {selectedStream && (
        <Card
          title="数据流详情"
          style={{ marginTop: 16 }}
          extra={
            <Button onClick={() => { setSelectedStream(null); if (wsRef.current) wsRef.current.close() }}>
              关闭
            </Button>
          }
        >
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={6}>
              <Statistic title="总记录数" value={streamData.length} />
            </Col>
            <Col span={6}>
              <Statistic 
                title="当前值" 
                value={streamData[0]?.value || streamData[0]?.amount || 0} 
                precision={2}
              />
            </Col>
            <Col span={6}>
              <Statistic 
                title="平均值" 
                value={streamData.length > 0 ? (streamData.reduce((sum, d) => sum + (d.value || d.amount || 0), 0) / streamData.length).toFixed(2) : 0} 
              />
            </Col>
            <Col span={6}>
              <Statistic 
                title="最大值" 
                value={streamData.length > 0 ? Math.max(...streamData.map(d => d.value || d.amount || 0)).toFixed(2) : 0} 
              />
            </Col>
          </Row>

          <Divider />

          <ReactECharts option={chartOption} style={{ height: 300 }} />

          <Divider />

          <Title level={5}>最近数据</Title>
          <Table
            dataSource={streamData.slice(0, 10)}
            rowKey={(record, index) => index}
            pagination={false}
            size="small"
          />
        </Card>
      )}

      <Modal
        title="创建数据流"
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={createStream}>
          <Form.Item name="name" label="数据流名称" rules={[{ required: true }]}>
            <Input placeholder="请输入数据流名称" />
          </Form.Item>

          <Form.Item name="description" label="描述">
            <TextArea rows={2} placeholder="请输入描述" />
          </Form.Item>

          <Form.Item name="source_type" label="数据源类型" rules={[{ required: true }]}>
            <Select placeholder="请选择数据源类型">
              <Option value="simulation">模拟数据</Option>
              <Option value="websocket">WebSocket</Option>
              <Option value="replay">数据回放</Option>
            </Select>
          </Form.Item>

          <Form.Item noStyle shouldUpdate={(prev, curr) => prev.source_type !== curr.source_type}>
            {({ getFieldValue }) => {
              const sourceType = getFieldValue('source_type')
              
              if (sourceType === 'simulation') {
                return (
                  <>
                    <Form.Item name="interval" label="发送间隔（秒）">
                      <InputNumber min={0.1} step={0.1} defaultValue={1} />
                    </Form.Item>
                    <Form.Item name="data_template" label="数据模板（JSON）">
                      <TextArea rows={4} placeholder='{"value": {"type": "int", "min": 0, "max": 100}}' />
                    </Form.Item>
                  </>
                )
              } else if (sourceType === 'websocket') {
                return (
                  <Form.Item name="websocket_url" label="WebSocket URL">
                    <Input placeholder="ws://localhost:8080/data" />
                  </Form.Item>
                )
              } else if (sourceType === 'replay') {
                return (
                  <>
                    <Form.Item name="replay_speed" label="回放速度">
                      <InputNumber min={0.5} max={10} step={0.5} defaultValue={1} />
                    </Form.Item>
                    <Form.Item name="timestamp_column" label="时间戳列">
                      <Input placeholder="可选，指定时间戳列名" />
                    </Form.Item>
                  </>
                )
              }
              return null
            }}
          </Form.Item>

          <Divider orientation="left">滑动窗口配置</Divider>

          <Form.Item name="window_size" label="窗口大小">
            <InputNumber min={1} defaultValue={60} />
          </Form.Item>

          <Form.Item name="window_unit" label="时间单位">
            <Select defaultValue="seconds">
              <Option value="seconds">秒</Option>
              <Option value="minutes">分钟</Option>
              <Option value="hours">小时</Option>
            </Select>
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">创建</Button>
              <Button onClick={() => setModalVisible(false)}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default StreamingPage
