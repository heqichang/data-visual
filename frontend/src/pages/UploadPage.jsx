import React, { useState } from 'react'
import { Upload, Button, Card, Tabs, Form, Input, Select, message, Space } from 'antd'
import { UploadOutlined, DatabaseOutlined, InboxOutlined } from '@ant-design/icons'
import axios from 'axios'

const { Dragger } = Upload
const { TabPane } = Tabs
const { Option } = Select

function UploadPage({ onDatasetLoaded }) {
  const [loading, setLoading] = useState(false)
  const [dbForm] = Form.useForm()

  const uploadProps = {
    name: 'file',
    multiple: false,
    action: '/api/upload',
    beforeUpload: (file) => {
      const isSupported = file.name.endsWith('.csv') || 
                          file.name.endsWith('.xlsx') || 
                          file.name.endsWith('.xls') || 
                          file.name.endsWith('.json')
      if (!isSupported) {
        message.error('只支持 CSV、Excel、JSON 格式的文件!')
        return Upload.LIST_IGNORE
      }
      setLoading(true)
      return true
    },
    onChange(info) {
      if (info.file.status === 'done') {
        setLoading(false)
        message.success(`${info.file.name} 上传成功!`)
        onDatasetLoaded(info.file.response)
      } else if (info.file.status === 'error') {
        setLoading(false)
        message.error(`${info.file.name} 上传失败: ${info.file.response?.detail || '未知错误'}`)
      }
    },
  }

  const handleDbConnect = async (values) => {
    setLoading(true)
    try {
      const response = await axios.post('/api/database', values)
      setLoading(false)
      message.success('数据库连接成功!')
      onDatasetLoaded(response.data)
    } catch (error) {
      setLoading(false)
      message.error('数据库连接失败: ' + (error.response?.data?.detail || error.message))
    }
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <Card title="数据导入">
        <Tabs defaultActiveKey="file">
          <TabPane tab={<span><UploadOutlined /> 文件上传</span>} key="file">
            <Dragger {...uploadProps} disabled={loading}>
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">点击或拖拽文件到此处上传</p>
              <p className="ant-upload-hint">
                支持 CSV、Excel (.xlsx, .xls)、JSON 格式文件
              </p>
            </Dragger>
          </TabPane>
          <TabPane tab={<span><DatabaseOutlined /> 数据库连接</span>} key="database">
            <Form
              form={dbForm}
              layout="vertical"
              onFinish={handleDbConnect}
              style={{ marginTop: 24 }}
            >
              <Form.Item name="db_type" label="数据库类型" rules={[{ required: true }]}>
                <Select placeholder="选择数据库类型">
                  <Option value="mysql">MySQL</Option>
                  <Option value="postgresql">PostgreSQL</Option>
                  <Option value="sqlite">SQLite</Option>
                </Select>
              </Form.Item>
              <Form.Item name="host" label="主机地址" rules={[{ required: true }]}>
                <Input placeholder="localhost" />
              </Form.Item>
              <Form.Item name="port" label="端口" rules={[{ required: true }]}>
                <Input placeholder="3306" />
              </Form.Item>
              <Form.Item name="database" label="数据库名" rules={[{ required: true }]}>
                <Input placeholder="数据库名称" />
              </Form.Item>
              <Form.Item name="username" label="用户名" rules={[{ required: true }]}>
                <Input placeholder="用户名" />
              </Form.Item>
              <Form.Item name="password" label="密码" rules={[{ required: true }]}>
                <Input.Password placeholder="密码" />
              </Form.Item>
              <Form.Item name="query" label="SQL 查询" rules={[{ required: true }]}>
                <Input.TextArea rows={4} placeholder="SELECT * FROM table_name" />
              </Form.Item>
              <Form.Item>
                <Space>
                  <Button type="primary" htmlType="submit" loading={loading}>
                    连接并导入
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </TabPane>
        </Tabs>
      </Card>
    </div>
  )
}

export default UploadPage
