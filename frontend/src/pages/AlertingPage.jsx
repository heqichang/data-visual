import React, { useState, useEffect } from 'react'
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
  Tabs,
  List,
  Timeline,
  Switch,
  Upload,
} from 'antd'
import {
  BellOutlined,
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  HistoryOutlined,
  SettingOutlined,
  MailOutlined,
  MessageOutlined,
  LinkOutlined,
} from '@ant-design/icons'
import axios from 'axios'

const { Title, Text } = Typography
const { Option } = Select
const { TextArea } = Input
const { TabPane } = Tabs

function AlertingPage({ datasetId }) {
  const [rules, setRules] = useState([])
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingRule, setEditingRule] = useState(null)
  const [activeTab, setActiveTab] = useState('rules')
  const [form] = Form.useForm()

  useEffect(() => {
    loadRules()
    loadAlerts()
  }, [])

  const loadRules = async () => {
    setLoading(true)
    try {
      const response = await axios.get('http://localhost:8000/api/alerting/rules')
      setRules(response.data.rules)
    } catch (error) {
      message.error('加载告警规则失败')
    }
    setLoading(false)
  }

  const loadAlerts = async () => {
    try {
      const response = await axios.get('http://localhost:8000/api/alerting/alerts')
      setAlerts(response.data.alerts)
    } catch (error) {
      console.error('加载告警历史失败')
    }
  }

  const saveRule = async (values) => {
    try {
      const ruleData = {
        name: values.name,
        description: values.description,
        severity: values.severity,
        condition: {
          type: 'threshold',
          metric: values.metric,
          operator: values.operator,
          threshold: values.threshold,
          dataset_id: datasetId,
          chart_id: values.chart_id,
        },
        notification: {
          channels: values.channels,
          email_config: values.channels.includes('email') ? { to: values.email_to, subject: values.email_subject } : undefined,
          webhook_config: values.channels.includes('webhook') ? { url: values.webhook_url, method: 'POST' } : undefined,
        },
        silencing: {
          enabled: values.silencing_enabled,
          duration_minutes: values.silencing_duration || 60,
        },
        enabled: true,
      }

      if (editingRule) {
        await axios.put(`http://localhost:8000/api/alerting/rules/${editingRule.rule_id}`, ruleData)
        message.success('规则更新成功')
      } else {
        await axios.post('http://localhost:8000/api/alerting/rules', ruleData)
        message.success('规则创建成功')
      }

      setModalVisible(false)
      form.resetFields()
      setEditingRule(null)
      loadRules()
    } catch (error) {
      message.error('保存规则失败')
    }
  }

  const toggleRule = async (ruleId, enabled) => {
    try {
      if (enabled) {
        await axios.post(`http://localhost:8000/api/alerting/rules/${ruleId}/enable`)
      } else {
        await axios.post(`http://localhost:8000/api/alerting/rules/${ruleId}/disable`)
      }
      message.success('规则状态已更新')
      loadRules()
    } catch (error) {
      message.error('更新规则状态失败')
    }
  }

  const deleteRule = async (ruleId) => {
    try {
      await axios.delete(`http://localhost:8000/api/alerting/rules/${ruleId}`)
      message.success('规则已删除')
      loadRules()
    } catch (error) {
      message.error('删除规则失败')
    }
  }

  const acknowledgeAlert = async (alertId) => {
    try {
      await axios.post(`http://localhost:8000/api/alerting/alerts/${alertId}/acknowledge`)
      message.success('告警已确认')
      loadAlerts()
    } catch (error) {
      message.error('确认告警失败')
    }
  }

  const resolveAlert = async (alertId) => {
    try {
      await axios.post(`http://localhost:8000/api/alerting/alerts/${alertId}/resolve`)
      message.success('告警已解决')
      loadAlerts()
    } catch (error) {
      message.error('解决告警失败')
    }
  }

  const testAlert = async (ruleId) => {
    try {
      await axios.post(`http://localhost:8000/api/alerting/rules/${ruleId}/test`)
      message.success('测试告警已发送')
    } catch (error) {
      message.error('测试告警失败')
    }
  }

  const editRule = (rule) => {
    setEditingRule(rule)
    form.setFieldsValue({
      name: rule.name,
      description: rule.description,
      severity: rule.severity,
      metric: rule.condition?.metric,
      operator: rule.condition?.operator,
      threshold: rule.condition?.threshold,
      chart_id: rule.condition?.chart_id,
      channels: rule.notification?.channels || [],
      email_to: rule.notification?.email_config?.to?.join(', '),
      email_subject: rule.notification?.email_config?.subject,
      webhook_url: rule.notification?.webhook_config?.url,
      silencing_enabled: rule.silencing?.enabled || false,
      silencing_duration: rule.silencing?.duration_minutes,
    })
    setModalVisible(true)
  }

  const getSeverityTag = (severity) => {
    const colors = {
      info: 'blue',
      warning: 'orange',
      critical: 'red',
    }
    const labels = {
      info: '信息',
      warning: '警告',
      critical: '严重',
    }
    return <Tag color={colors[severity] || 'default'}>{labels[severity] || severity}</Tag>
  }

  const getStatusTag = (status) => {
    const colors = {
      active: 'red',
      acknowledged: 'orange',
      resolved: 'green',
    }
    const labels = {
      active: '触发中',
      acknowledged: '已确认',
      resolved: '已解决',
    }
    return <Tag color={colors[status] || 'default'}>{labels[status] || status}</Tag>
  }

  const getOperatorLabel = (op) => {
    const labels = {
      '>': '大于',
      '<': '小于',
      '>=': '大于等于',
      '<=': '小于等于',
      '==': '等于',
      '!=': '不等于',
    }
    return labels[op] || op
  }

  const getChannelIcon = (channel) => {
    const icons = {
      email: <MailOutlined />,
      slack: <MessageOutlined />,
      webhook: <LinkOutlined />,
    }
    return icons[channel] || <BellOutlined />
  }

  const ruleColumns = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '级别',
      dataIndex: 'severity',
      key: 'severity',
      render: (severity) => getSeverityTag(severity)
    },
    {
      title: '条件',
      key: 'condition',
      render: (_, record) => (
        <Text>
          {record.condition?.metric} {getOperatorLabel(record.condition?.operator)} {record.condition?.threshold}
        </Text>
      )
    },
    {
      title: '通知渠道',
      dataIndex: ['notification', 'channels'],
      key: 'channels',
      render: (channels) => (
        <Space>
          {channels?.map(ch => (
            <span key={ch} title={ch}>{getChannelIcon(ch)}</span>
          ))}
        </Space>
      )
    },
    {
      title: '触发次数',
      dataIndex: 'trigger_count',
      key: 'trigger_count',
    },
    {
      title: '状态',
      key: 'enabled',
      render: (_, record) => (
        <Switch
          checked={record.enabled}
          onChange={(checked) => toggleRule(record.rule_id, checked)}
        />
      )
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Space size="small">
          <Button type="link" icon={<EditOutlined />} onClick={() => editRule(record)}>
            编辑
          </Button>
          <Button type="link" onClick={() => testAlert(record.rule_id)}>
            测试
          </Button>
          <Button type="link" danger icon={<DeleteOutlined />} onClick={() => deleteRule(record.rule_id)}>
            删除
          </Button>
        </Space>
      )
    }
  ]

  const alertColumns = [
    {
      title: '规则',
      dataIndex: 'rule_name',
      key: 'rule_name',
    },
    {
      title: '级别',
      dataIndex: 'severity',
      key: 'severity',
      render: (severity) => getSeverityTag(severity)
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status) => getStatusTag(status)
    },
    {
      title: '触发值',
      dataIndex: ['context', 'current_value'],
      key: 'current_value',
      render: (value) => value !== undefined ? value.toFixed(2) : '-'
    },
    {
      title: '阈值',
      dataIndex: ['context', 'threshold'],
      key: 'threshold',
    },
    {
      title: '触发时间',
      dataIndex: 'triggered_at',
      key: 'triggered_at',
      render: (time) => new Date(time).toLocaleString()
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Space size="small">
          {record.status === 'active' && (
            <>
              <Button type="link" icon={<CheckCircleOutlined />} onClick={() => acknowledgeAlert(record.alert_id)}>
                确认
              </Button>
              <Button type="link" onClick={() => resolveAlert(record.alert_id)}>
                解决
              </Button>
            </>
          )}
        </Space>
      )
    }
  ]

  const stats = {
    total: rules.length,
    enabled: rules.filter(r => r.enabled).length,
    activeAlerts: alerts.filter(a => a.status === 'active').length,
    resolvedToday: alerts.filter(a => a.status === 'resolved' && new Date(a.resolved_at) > new Date(Date.now() - 24 * 60 * 60 * 1000)).length,
  }

  return (
    <div>
      <Card
        title={
          <Space>
            <BellOutlined />
            <span>告警系统</span>
          </Space>
        }
        extra={
          <Button 
            type="primary" 
            icon={<PlusOutlined />} 
            onClick={() => { setEditingRule(null); form.resetFields(); setModalVisible(true) }}
          >
            创建告警规则
          </Button>
        }
      >
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Statistic title="总规则数" value={stats.total} />
          </Col>
          <Col span={6}>
            <Statistic title="已启用" value={stats.enabled} />
          </Col>
          <Col span={6}>
            <Statistic 
              title="活动告警" 
              value={stats.activeAlerts} 
              valueStyle={{ color: stats.activeAlerts > 0 ? '#cf1322' : '#3f8600' }}
            />
          </Col>
          <Col span={6}>
            <Statistic title="今日已解决" value={stats.resolvedToday} />
          </Col>
        </Row>

        <Tabs activeKey={activeTab} onChange={setActiveTab}>
          <TabPane tab="告警规则" key="rules">
            <Table
              columns={ruleColumns}
              dataSource={rules}
              rowKey="rule_id"
              loading={loading}
              pagination={{ pageSize: 10 }}
            />
          </TabPane>

          <TabPane tab="告警历史" key="history">
            <Table
              columns={alertColumns}
              dataSource={alerts}
              rowKey="alert_id"
              pagination={{ pageSize: 10 }}
            />
          </TabPane>
        </Tabs>
      </Card>

      <Modal
        title={editingRule ? '编辑告警规则' : '创建告警规则'}
        open={modalVisible}
        onCancel={() => { setModalVisible(false); setEditingRule(null) }}
        footer={null}
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={saveRule}>
          <Form.Item name="name" label="规则名称" rules={[{ required: true }]}>
            <Input placeholder="请输入规则名称" />
          </Form.Item>

          <Form.Item name="description" label="描述">
            <TextArea rows={2} placeholder="请输入规则描述" />
          </Form.Item>

          <Form.Item name="severity" label="告警级别" rules={[{ required: true }]}>
            <Select>
              <Option value="info">信息</Option>
              <Option value="warning">警告</Option>
              <Option value="critical">严重</Option>
            </Select>
          </Form.Item>

          <Divider orientation="left">告警条件</Divider>

          <Form.Item name="metric" label="指标字段" rules={[{ required: true }]}>
            <Input placeholder="例如: value, amount, sales" />
          </Form.Item>

          <Form.Item name="operator" label="比较运算符" rules={[{ required: true }]}>
            <Select>
              <Option value=">">大于 (>)</Option>
              <Option value="<">小于 (<)</Option>
              <Option value=">=">大于等于 (>=)</Option>
              <Option value="<=">小于等于 (<=)</Option>
              <Option value="==">等于 (==)</Option>
              <Option value="!=">不等于 (!=)</Option>
            </Select>
          </Form.Item>

          <Form.Item name="threshold" label="阈值" rules={[{ required: true }]}>
            <InputNumber step={0.01} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item name="chart_id" label="关联图表ID">
            <Input placeholder="可选，关联特定图表" />
          </Form.Item>

          <Divider orientation="left">通知渠道</Divider>

          <Form.Item name="channels" label="通知渠道" rules={[{ required: true }]}>
            <Select mode="multiple">
              <Option value="email">邮件</Option>
              <Option value="webhook">Webhook</Option>
              <Option value="slack">Slack</Option>
            </Select>
          </Form.Item>

          <Form.Item noStyle shouldUpdate={(prev, curr) => prev.channels !== curr.channels}>
            {({ getFieldValue }) => {
              const channels = getFieldValue('channels') || []
              return (
                <>
                  {channels.includes('email') && (
                    <>
                      <Form.Item name="email_to" label="收件人（多个用逗号分隔）">
                        <Input placeholder="email@example.com, another@example.com" />
                      </Form.Item>
                      <Form.Item name="email_subject" label="邮件主题">
                        <Input placeholder="告警通知: {rule_name}" />
                      </Form.Item>
                    </>
                  )}
                  {channels.includes('webhook') && (
                    <Form.Item name="webhook_url" label="Webhook URL">
                      <Input placeholder="https://example.com/webhook" />
                    </Form.Item>
                  )}
                </>
              )
            }}
          </Form.Item>

          <Divider orientation="left">静默期配置</Divider>

          <Form.Item name="silencing_enabled" label="启用静默期" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Form.Item noStyle shouldUpdate={(prev, curr) => prev.silencing_enabled !== curr.silencing_enabled}>
            {({ getFieldValue }) => {
              const enabled = getFieldValue('silencing_enabled')
              return enabled ? (
                <Form.Item name="silencing_duration" label="静默期时长（分钟）">
                  <InputNumber min={1} defaultValue={60} style={{ width: '100%' }} />
                </Form.Item>
              ) : null
            }}
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                {editingRule ? '更新' : '创建'}
              </Button>
              <Button onClick={() => { setModalVisible(false); setEditingRule(null) }}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default AlertingPage
