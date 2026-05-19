import React, { useState, useEffect } from 'react'
import {
  Card,
  Button,
  Space,
  Tree,
  Table,
  message,
  Typography,
  Divider,
  Row,
  Col,
  Tag,
  List,
  Modal,
  Form,
  Input,
  Select,
  Empty,
} from 'antd'
import {
  ForkOutlined,
  ApiOutlined,
  BarChartOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  TableOutlined,
  AlertOutlined,
  SearchOutlined,
  DownOutlined,
  RightOutlined,
  ShareAltOutlined,
} from '@ant-design/icons'
import axios from 'axios'
import * as echarts from 'echarts'

const { Title, Text } = Typography
const { Option } = Select
const { DirectoryTree } = Tree

function LineagePage() {
  const [lineageData, setLineageData] = useState(null)
  const [selectedNode, setSelectedNode] = useState(null)
  const [impactAnalysis, setImpactAnalysis] = useState(null)
  const [loading, setLoading] = useState(false)
  const chartRef = React.useRef(null)
  const chartInstance = React.useRef(null)
  const [treeData, setTreeData] = useState([])
  const [nodes, setNodes] = useState([])
  const [edges, setEdges] = useState([])
  const [expandedKeys, setExpandedKeys] = useState([])

  useEffect(() => {
    loadLineage()
    return () => {
      if (chartInstance.current) {
        chartInstance.current.dispose()
      }
    }
  }, [])

  useEffect(() => {
    if (lineageData) {
      buildTreeData()
      initChart()
    }
  }, [lineageData])

  const loadLineage = async () => {
    setLoading(true)
    try {
      const response = await axios.get('http://localhost:8000/api/lineage/graph')
      setLineageData(response.data)
      setNodes(response.data.nodes || [])
      setEdges(response.data.edges || [])
    } catch (error) {
      message.error('加载数据血缘失败')
    }
    setLoading(false)
  }

  const buildTreeData = () => {
    if (!lineageData?.nodes) return

    const nodeMap = {}
    lineageData.nodes.forEach(node => {
      nodeMap[node.node_id] = {
        title: node.name,
        key: node.node_id,
        icon: getNodeIcon(node.node_type),
        isLeaf: !lineageData.edges?.some(e => e.source_id === node.node_id),
        data: node,
        children: []
      }
    })

    lineageData.edges?.forEach(edge => {
      if (nodeMap[edge.source_id] && nodeMap[edge.target_id]) {
        nodeMap[edge.source_id].children.push(nodeMap[edge.target_id])
      }
    })

    const rootNodes = Object.values(nodeMap).filter(node => 
      !lineageData.edges?.some(e => e.target_id === node.key)
    )

    setTreeData(rootNodes)
    setExpandedKeys(rootNodes.map(n => n.key))
  }

  const getNodeIcon = (type) => {
    const icons = {
      data_source: <DatabaseOutlined />,
      pipeline: <ApiOutlined />,
      dataset: <TableOutlined />,
      chart: <BarChartOutlined />,
      dashboard: <DashboardOutlined />,
      alert: <AlertOutlined />,
    }
    return icons[type] || <DatabaseOutlined />
  }

  const getNodeTypeLabel = (type) => {
    const labels = {
      data_source: '数据源',
      pipeline: '转换管道',
      dataset: '数据集',
      chart: '图表',
      dashboard: '仪表盘',
      alert: '告警规则',
    }
    return labels[type] || type
  }

  const getNodeColor = (type) => {
    const colors = {
      data_source: '#1890ff',
      pipeline: '#722ed1',
      dataset: '#13c2c2',
      chart: '#52c41a',
      dashboard: '#fa8c16',
      alert: '#f5222d',
    }
    return colors[type] || '#999'
  }

  const initChart = () => {
    if (!chartRef.current || !lineageData) return

    if (chartInstance.current) {
      chartInstance.current.dispose()
    }

    const myChart = echarts.init(chartRef.current)
    chartInstance.current = myChart

    const nodeList = lineageData.nodes?.map(node => ({
      id: node.node_id,
      name: node.name,
      category: node.node_type,
      symbolSize: 40,
      itemStyle: {
        color: getNodeColor(node.node_type)
      },
      label: {
        show: true,
        position: 'bottom',
        fontSize: 12
      }
    })) || []

    const linkList = lineageData.edges?.map(edge => ({
      source: edge.source_id,
      target: edge.target_id,
      lineStyle: {
        color: '#999',
        curveness: 0.2
      },
      label: {
        show: true,
        formatter: edge.edge_type || '',
        fontSize: 10,
        backgroundColor: '#fff',
        padding: [2, 4]
      }
    })) || []

    const categories = [
      { name: '数据源' },
      { name: '转换管道' },
      { name: '数据集' },
      { name: '图表' },
      { name: '仪表盘' },
      { name: '告警规则' },
    ]

    const option = {
      title: {
        text: '数据血缘 DAG 图',
        left: 'center',
        top: 10
      },
      tooltip: {
        formatter: (params) => {
          if (params.dataType === 'node') {
            const node = lineageData.nodes?.find(n => n.node_id === params.data.id)
            return `
              <div style="padding: 8px;">
                <strong>${node?.name}</strong><br/>
                类型: ${getNodeTypeLabel(node?.node_type)}<br/>
                描述: ${node?.description || '无'}<br/>
                ${node?.metadata ? `元数据: ${JSON.stringify(node.metadata)}` : ''}
              </div>
            `
          } else if (params.dataType === 'edge') {
            const edge = lineageData.edges?.find(
              e => e.source_id === params.data.source && e.target_id === params.data.target
            )
            return `
              <div style="padding: 8px;">
                <strong>${edge?.edge_type || '关系'}</strong><br/>
                ${edge?.fields?.length ? `字段: ${edge.fields.join(', ')}` : ''}
              </div>
            `
          }
          return ''
        }
      },
      legend: [{
        data: categories.map(c => c.name),
        top: 40
      }],
      series: [{
        type: 'graph',
        layout: 'force',
        animation: true,
        data: nodeList,
        links: linkList,
        categories: categories,
        roam: true,
        draggable: true,
        label: {
          position: 'right',
          formatter: '{b}'
        },
        lineStyle: {
          color: 'source',
          curveness: 0.3
        },
        force: {
          repulsion: 500,
          edgeLength: 150,
          gravity: 0.1
        },
        emphasis: {
          focus: 'adjacency',
          lineStyle: {
            width: 5
          }
        }
      }]
    }

    myChart.setOption(option)
    myChart.on('click', (params) => {
      if (params.dataType === 'node') {
        const node = lineageData.nodes?.find(n => n.node_id === params.data.id)
        if (node) {
          handleNodeSelect(node)
        }
      }
    })

    window.addEventListener('resize', () => {
      myChart.resize()
    })
  }

  const handleNodeSelect = async (node) => {
    setSelectedNode(node)
    setImpactAnalysis(null)

    try {
      const response = await axios.get(
        `http://localhost:8000/api/lineage/impact/${node.node_id}`
      )
      setImpactAnalysis(response.data)
    } catch (error) {
      message.error('加载影响分析失败')
    }
  }

  const onTreeSelect = (selectedKeys, info) => {
    if (selectedKeys.length > 0 && info.node?.data) {
      handleNodeSelect(info.node.data)
    }
  }

  const addLineage = async (values) => {
    try {
      const response = await axios.post('http://localhost:8000/api/lineage/lineage', values)
      message.success('血缘关系添加成功')
      loadLineage()
    } catch (error) {
      message.error('添加血缘关系失败')
    }
  }

  const nodeColumns = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => (
        <Space>
          {getNodeIcon(record.node_type)}
          <span>{text}</span>
        </Space>
      )
    },
    {
      title: '类型',
      dataIndex: 'node_type',
      key: 'node_type',
      render: (type) => (
        <Tag color={getNodeColor(type)}>
          {getNodeTypeLabel(type)}
        </Tag>
      )
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (time) => time ? new Date(time).toLocaleString() : '-'
    }
  ]

  const edgeColumns = [
    {
      title: '源节点',
      dataIndex: 'source_id',
      key: 'source_id',
      render: (id) => {
        const node = nodes.find(n => n.node_id === id)
        return node?.name || id
      }
    },
    {
      title: '关系类型',
      dataIndex: 'edge_type',
      key: 'edge_type',
    },
    {
      title: '目标节点',
      dataIndex: 'target_id',
      key: 'target_id',
      render: (id) => {
        const node = nodes.find(n => n.node_id === id)
        return node?.name || id
      }
    },
    {
      title: '字段',
      dataIndex: 'fields',
      key: 'fields',
      render: (fields) => fields?.join(', ') || '-'
    }
  ]

  return (
    <div>
      <Card
        title={
          <Space>
            <ForkOutlined />
            <span>数据血缘</span>
          </Space>
        }
        loading={loading}
      >
        <Row gutter={16}>
          <Col span={6}>
            <Card 
              title="资源树" 
              size="small"
              style={{ height: 500, overflow: 'auto' }}
            >
              {treeData.length > 0 ? (
                <DirectoryTree
                  treeData={treeData}
                  onSelect={onTreeSelect}
                  expandedKeys={expandedKeys}
                  onExpand={setExpandedKeys}
                />
              ) : (
                <Empty description="暂无数据" />
              )}
            </Card>
          </Col>
          <Col span={10}>
            <Card 
              title="血缘图谱" 
              size="small"
              extra={
                <Button type="link" onClick={loadLineage}>
                  刷新
                </Button>
              }
            >
              <div ref={chartRef} style={{ height: 450 }} />
            </Card>
          </Col>
          <Col span={8}>
            <Card 
              title="节点详情" 
              size="small"
              style={{ height: 500, overflow: 'auto' }}
            >
              {selectedNode ? (
                <div>
                  <Space style={{ marginBottom: 16 }}>
                    {getNodeIcon(selectedNode.node_type)}
                    <Title level={4} style={{ margin: 0 }}>
                      {selectedNode.name}
                    </Title>
                    <Tag color={getNodeColor(selectedNode.node_type)}>
                      {getNodeTypeLabel(selectedNode.node_type)}
                    </Tag>
                  </Space>

                  <p><strong>ID:</strong> {selectedNode.node_id}</p>
                  <p><strong>描述:</strong> {selectedNode.description || '无'}</p>
                  {selectedNode.metadata && (
                    <p><strong>元数据:</strong></p>
                  )}
                  {selectedNode.metadata && (
                    <pre style={{ 
                      background: '#f5f5f5', 
                      padding: 8, 
                      borderRadius: 4,
                      maxHeight: 100,
                      overflow: 'auto'
                    }}>
                      {JSON.stringify(selectedNode.metadata, null, 2)}
                    </pre>
                  )}

                  {selectedNode.fields && selectedNode.fields.length > 0 && (
                    <>
                      <Divider />
                      <Title level={5}>字段列表</Title>
                      <List
                        size="small"
                        dataSource={selectedNode.fields}
                        renderItem={field => (
                          <List.Item>
                            <Space>
                              <Tag color="blue">{field.type || 'field'}</Tag>
                              <Text>{field.name}</Text>
                              {field.description && (
                                <Text type="secondary">{field.description}</Text>
                              )}
                            </Space>
                          </List.Item>
                        )}
                      />
                    </>
                  )}

                  {impactAnalysis && (
                    <>
                      <Divider />
                      <Title level={5}>影响分析</Title>
                      <p><strong>影响的图表:</strong> {impactAnalysis.impacted_charts?.length || 0}</p>
                      <p><strong>影响的仪表盘:</strong> {impactAnalysis.impacted_dashboards?.length || 0}</p>
                      <p><strong>影响的告警:</strong> {impactAnalysis.impacted_alerts?.length || 0}</p>
                      <p><strong>总计影响:</strong> {impactAnalysis.total_impact || 0} 个对象</p>
                    </>
                  )}
                </div>
              ) : (
                <Empty description="请选择一个节点查看详情" />
              )}
            </Card>
          </Col>
        </Row>

        <Divider />

        <Row gutter={16}>
          <Col span={12}>
            <Card title="节点列表" size="small">
              <Table
                dataSource={nodes}
                columns={nodeColumns}
                rowKey="node_id"
                pagination={{ pageSize: 5 }}
                size="small"
                onRow={(record) => ({
                  onClick: () => handleNodeSelect(record)
                })}
              />
            </Card>
          </Col>
          <Col span={12}>
            <Card title="关系列表" size="small">
              <Table
                dataSource={edges}
                columns={edgeColumns}
                rowKey="edge_id"
                pagination={{ pageSize: 5 }}
                size="small"
              />
            </Card>
          </Col>
        </Row>
      </Card>
    </div>
  )
}

export default LineagePage
