import uuid
import re
from datetime import datetime
from typing import Dict, List, Any, Optional, Set, Tuple
from pydantic import BaseModel
import networkx as nx
import sqlglot


class LineageNode(BaseModel):
    node_id: str
    node_type: str
    name: str
    description: Optional[str] = None
    metadata: Dict[str, Any] = {}


class LineageEdge(BaseModel):
    edge_id: str
    source_id: str
    target_id: str
    edge_type: str
    description: Optional[str] = None
    fields: List[str] = []


class DataLineage:
    def __init__(self):
        self.nodes: Dict[str, LineageNode] = {}
        self.edges: Dict[str, LineageEdge] = {}
        self.graph = nx.DiGraph()
        self.field_lineage: Dict[str, List[Tuple[str, str]]] = {}

    def add_node(self, node: LineageNode) -> LineageNode:
        self.nodes[node.node_id] = node
        self.graph.add_node(node.node_id, **node.dict())
        return node

    def add_edge(self, edge: LineageEdge) -> LineageEdge:
        self.edges[edge.edge_id] = edge
        self.graph.add_edge(
            edge.source_id,
            edge.target_id,
            edge_id=edge.edge_id,
            edge_type=edge.edge_type,
            fields=edge.fields,
        )
        return edge

    def get_node(self, node_id: str) -> Optional[LineageNode]:
        return self.nodes.get(node_id)

    def get_edge(self, edge_id: str) -> Optional[LineageEdge]:
        return self.edges.get(edge_id)

    def get_ancestors(self, node_id: str) -> List[LineageNode]:
        if node_id not in self.graph:
            return []
        ancestor_ids = nx.ancestors(self.graph, node_id)
        return [self.nodes[nid] for nid in ancestor_ids if nid in self.nodes]

    def get_descendants(self, node_id: str) -> List[LineageNode]:
        if node_id not in self.graph:
            return []
        descendant_ids = nx.descendants(self.graph, node_id)
        return [self.nodes[nid] for nid in descendant_ids if nid in self.nodes]

    def get_path(self, source_id: str, target_id: str) -> List[List[LineageNode]]:
        if source_id not in self.graph or target_id not in self.graph:
            return []
        
        try:
            paths = list(nx.all_simple_paths(self.graph, source_id, target_id))
            return [
                [self.nodes[nid] for nid in path if nid in self.nodes]
                for path in paths
            ]
        except nx.NetworkXNoPath:
            return []

    def to_dict(self) -> Dict[str, Any]:
        return {
            "nodes": [n.dict() for n in self.nodes.values()],
            "edges": [e.dict() for e in self.edges.values()],
        }

    def analyze_impact(self, node_id: str) -> Dict[str, Any]:
        ancestors = self.get_ancestors(node_id)
        descendants = self.get_descendants(node_id)
        
        return {
            "node": self.nodes.get(node_id),
            "upstream_dependencies": ancestors,
            "downstream_impact": descendants,
            "total_affected_nodes": len(ancestors) + len(descendants),
            "risk_level": "high" if len(descendants) > 5 else "medium" if len(descendants) > 2 else "low",
        }

    def parse_sql_lineage(self, sql: str, target_dataset: str) -> Dict[str, Any]:
        try:
            parsed = sqlglot.parse_one(sql)
            
            source_tables = []
            for table in parsed.find_all(sqlglot.exp.Table):
                if table.name != target_dataset:
                    source_tables.append(table.name)
            
            selected_columns = []
            for col in parsed.find_all(sqlglot.exp.Column):
                selected_columns.append(col.name)
            
            return {
                "source_tables": list(set(source_tables)),
                "selected_columns": list(set(selected_columns)),
                "target_dataset": target_dataset,
            }
        except Exception as e:
            return {"error": str(e)}

    def add_field_lineage(self, source_field: str, target_field: str, transformation: str = None):
        if source_field not in self.field_lineage:
            self.field_lineage[source_field] = []
        self.field_lineage[source_field].append((target_field, transformation or ""))

    def get_field_lineage(self, field_name: str) -> Dict[str, Any]:
        upstream = []
        downstream = []
        
        for source, targets in self.field_lineage.items():
            for target, transformation in targets:
                if source == field_name:
                    downstream.append({
                        "field": target,
                        "transformation": transformation,
                    })
                if target == field_name:
                    upstream.append({
                        "field": source,
                        "transformation": transformation,
                    })
        
        return {
            "field": field_name,
            "upstream": upstream,
            "downstream": downstream,
        }


class LineageEngine:
    def __init__(self):
        self.lineages: Dict[str, DataLineage] = {}
        self._init_default_lineage()

    def _init_default_lineage(self):
        default_lineage = DataLineage()
        self.lineages["default"] = default_lineage

    def create_lineage(self, lineage_id: Optional[str] = None) -> DataLineage:
        lineage_id = lineage_id or str(uuid.uuid4())
        self.lineages[lineage_id] = DataLineage()
        return self.lineages[lineage_id]

    def get_lineage(self, lineage_id: str) -> Optional[DataLineage]:
        return self.lineages.get(lineage_id)

    def list_lineages(self) -> List[Dict[str, Any]]:
        return [
            {
                "lineage_id": lid,
                "node_count": len(lineage.nodes),
                "edge_count": len(lineage.edges),
            }
            for lid, lineage in self.lineages.items()
        ]

    def delete_lineage(self, lineage_id: str) -> bool:
        if lineage_id in self.lineages:
            del self.lineages[lineage_id]
            return True
        return False

    def add_dataset_lineage(self, dataset_id: str, name: str, 
                            source_datasets: List[str] = None,
                            transformation: str = None,
                            fields: List[str] = None,
                            lineage_id: str = "default") -> Dict[str, Any]:
        lineage = self.get_lineage(lineage_id)
        if not lineage:
            lineage = self.create_lineage(lineage_id)
        
        dataset_node = LineageNode(
            node_id=f"dataset_{dataset_id}",
            node_type="dataset",
            name=name,
            description=f"数据集: {name}",
            metadata={"dataset_id": dataset_id, "fields": fields or []},
        )
        lineage.add_node(dataset_node)
        
        if source_datasets:
            for source_id in source_datasets:
                source_node = lineage.get_node(f"dataset_{source_id}")
                if not source_node:
                    source_node = LineageNode(
                        node_id=f"dataset_{source_id}",
                        node_type="dataset",
                        name=f"数据源: {source_id}",
                        metadata={"dataset_id": source_id},
                    )
                    lineage.add_node(source_node)
                
                edge = LineageEdge(
                    edge_id=str(uuid.uuid4()),
                    source_id=source_node.node_id,
                    target_id=dataset_node.node_id,
                    edge_type="transformation",
                    description=transformation or "数据转换",
                    fields=fields or [],
                )
                lineage.add_edge(edge)
        
        return {"node_id": dataset_node.node_id, "lineage_id": lineage_id}

    def add_chart_lineage(self, chart_id: str, name: str,
                          dataset_id: str,
                          fields_used: List[str] = None,
                          lineage_id: str = "default") -> Dict[str, Any]:
        lineage = self.get_lineage(lineage_id)
        if not lineage:
            lineage = self.create_lineage(lineage_id)
        
        chart_node = LineageNode(
            node_id=f"chart_{chart_id}",
            node_type="chart",
            name=name,
            description=f"图表: {name}",
            metadata={"chart_id": chart_id, "fields_used": fields_used or []},
        )
        lineage.add_node(chart_node)
        
        dataset_node = lineage.get_node(f"dataset_{dataset_id}")
        if dataset_node:
            edge = LineageEdge(
                edge_id=str(uuid.uuid4()),
                source_id=dataset_node.node_id,
                target_id=chart_node.node_id,
                edge_type="visualization",
                description="图表使用该数据集",
                fields=fields_used or [],
            )
            lineage.add_edge(edge)
        
        return {"node_id": chart_node.node_id, "lineage_id": lineage_id}

    def add_dashboard_lineage(self, dashboard_id: str, name: str,
                              chart_ids: List[str],
                              lineage_id: str = "default") -> Dict[str, Any]:
        lineage = self.get_lineage(lineage_id)
        if not lineage:
            lineage = self.create_lineage(lineage_id)
        
        dashboard_node = LineageNode(
            node_id=f"dashboard_{dashboard_id}",
            node_type="dashboard",
            name=name,
            description=f"仪表盘: {name}",
            metadata={"dashboard_id": dashboard_id, "chart_ids": chart_ids},
        )
        lineage.add_node(dashboard_node)
        
        for chart_id in chart_ids:
            chart_node = lineage.get_node(f"chart_{chart_id}")
            if chart_node:
                edge = LineageEdge(
                    edge_id=str(uuid.uuid4()),
                    source_id=chart_node.node_id,
                    target_id=dashboard_node.node_id,
                    edge_type="composition",
                    description="仪表盘包含该图表",
                )
                lineage.add_edge(edge)
        
        return {"node_id": dashboard_node.node_id, "lineage_id": lineage_id}

    def get_full_lineage(self, lineage_id: str = "default") -> Dict[str, Any]:
        lineage = self.get_lineage(lineage_id)
        if not lineage:
            return {"nodes": [], "edges": []}
        return lineage.to_dict()

    def get_node_impact(self, node_id: str, lineage_id: str = "default") -> Dict[str, Any]:
        lineage = self.get_lineage(lineage_id)
        if not lineage:
            raise ValueError("Lineage not found")
        return lineage.analyze_impact(node_id)

    def search_lineage(self, keyword: str, lineage_id: str = "default") -> List[Dict[str, Any]]:
        lineage = self.get_lineage(lineage_id)
        if not lineage:
            return []
        
        results = []
        keyword_lower = keyword.lower()
        
        for node in lineage.nodes.values():
            if (keyword_lower in node.name.lower() or
                keyword_lower in (node.description or "").lower()):
                results.append(node.dict())
        
        return results


lineage_engine = LineageEngine()
