from flask import Flask, render_template, request, jsonify, session
from tinydb import TinyDB, Query
import networkx as nx
import numpy as np
import json
import os
import math

app = Flask(__name__)
app.secret_key = os.environ.get('SESSION_SECRET', 'teen-sensor-network-secret-key')

db = TinyDB('sensor_network_db.json')
simulations_table = db.table('simulations')
results_table = db.table('results')

class SensorNetwork:
    def __init__(self, num_nodes, canvas_width=800, canvas_height=600):
        self.num_nodes = num_nodes
        self.canvas_width = canvas_width
        self.canvas_height = canvas_height
        self.nodes = []
        self.graph = nx.Graph()
        self.generate_nodes()
        self.create_connections()
    
    def generate_nodes(self):
        np.random.seed(42)
        padding = 50
        for i in range(self.num_nodes):
            angle = 2 * np.pi * i / self.num_nodes
            radius_variation = 0.3 + 0.5 * (i % 5) / 5
            center_x = self.canvas_width / 2
            center_y = self.canvas_height / 2
            max_radius = min(center_x, center_y) - padding
            
            if i == 0:
                x = center_x
                y = center_y
            else:
                spiral_factor = (i / self.num_nodes) * 0.8 + 0.2
                x = center_x + max_radius * spiral_factor * np.cos(angle + i * 0.1)
                y = center_y + max_radius * spiral_factor * np.sin(angle + i * 0.1)
            
            x = max(padding, min(self.canvas_width - padding, x))
            y = max(padding, min(self.canvas_height - padding, y))
            
            energy = 100 - (i % 20) * 2
            threshold_hard = 25 + (i % 10)
            threshold_soft = 5 + (i % 5)
            
            node = {
                'id': i,
                'x': float(x),
                'y': float(y),
                'energy': energy,
                'threshold_hard': threshold_hard,
                'threshold_soft': threshold_soft,
                'is_cluster_head': i % 10 == 0
            }
            self.nodes.append(node)
            self.graph.add_node(i, **node)
    
    def calculate_distance(self, node1, node2):
        return math.sqrt((node1['x'] - node2['x'])**2 + (node1['y'] - node2['y'])**2)
    
    def create_connections(self):
        connection_range = 150
        for i in range(len(self.nodes)):
            for j in range(i + 1, len(self.nodes)):
                dist = self.calculate_distance(self.nodes[i], self.nodes[j])
                if dist <= connection_range:
                    weight = dist / 10
                    self.graph.add_edge(i, j, weight=weight, distance=dist)
        
        for i in range(len(self.nodes)):
            if self.graph.degree(i) == 0:
                closest_node = None
                min_dist = float('inf')
                for j in range(len(self.nodes)):
                    if i != j:
                        dist = self.calculate_distance(self.nodes[i], self.nodes[j])
                        if dist < min_dist:
                            min_dist = dist
                            closest_node = j
                if closest_node is not None:
                    self.graph.add_edge(i, closest_node, weight=min_dist/10, distance=min_dist)
    
    def get_teen_path(self, source, destination):
        try:
            path = nx.bellman_ford_path(self.graph, source, destination, weight='weight')
            total_weight = 0
            for i in range(len(path) - 1):
                total_weight += self.graph[path[i]][path[i+1]]['weight']
            return path, total_weight
        except nx.NetworkXNoPath:
            return [], 0
    
    def get_existing_protocol_path(self, source, destination):
        try:
            shortest_path = nx.shortest_path(self.graph, source, destination)
            if len(shortest_path) <= 2:
                path = shortest_path
            else:
                path = [source]
                current = source
                visited = {source}
                max_hops = min(len(shortest_path) + 5, 12)
                
                for _ in range(max_hops):
                    if current == destination:
                        break
                    neighbors = list(self.graph.neighbors(current))
                    unvisited = [n for n in neighbors if n not in visited]
                    
                    if destination in neighbors:
                        if len(path) >= len(shortest_path):
                            path.append(destination)
                            break
                        elif not unvisited:
                            path.append(destination)
                            break
                    
                    if unvisited:
                        farthest = max(unvisited, key=lambda n: self.calculate_distance(self.nodes[n], self.nodes[destination]))
                        path.append(farthest)
                        visited.add(farthest)
                        current = farthest
                    elif destination in neighbors:
                        path.append(destination)
                        break
                    else:
                        path.append(destination) if destination in neighbors else None
                        break
                
                if path[-1] != destination:
                    try:
                        remaining = nx.shortest_path(self.graph, current, destination)
                        path.extend(remaining[1:])
                    except:
                        path = shortest_path
            
            total_weight = 0
            for i in range(len(path) - 1):
                if self.graph.has_edge(path[i], path[i+1]):
                    total_weight += self.graph[path[i]][path[i+1]]['weight']
            return path, total_weight
        except:
            return [], 0
    
    def get_edges(self):
        edges = []
        for u, v, data in self.graph.edges(data=True):
            edges.append({
                'source': u,
                'target': v,
                'weight': data['weight'],
                'distance': data['distance']
            })
        return edges
    
    def calculate_metrics(self, teen_path, existing_path):
        teen_latency = len(teen_path) * 2.5 + sum([self.graph[teen_path[i]][teen_path[i+1]]['weight'] * 0.1 
                                                   for i in range(len(teen_path)-1)]) if len(teen_path) > 1 else 0
        existing_latency = len(existing_path) * 8.5 + sum([self.graph[existing_path[i]][existing_path[i+1]]['weight'] * 0.5 
                                                          for i in range(len(existing_path)-1)]) if len(existing_path) > 1 else 0
        
        teen_signal = np.array([0.95 - i*0.02 for i in range(len(teen_path))])
        existing_signal = np.array([0.85 - i*0.05 for i in range(len(existing_path))])
        ideal_signal = np.ones(max(len(teen_path), len(existing_path)))
        
        teen_mse = np.mean((teen_signal - ideal_signal[:len(teen_signal)])**2) if len(teen_signal) > 0 else 0
        existing_mse = np.mean((existing_signal - ideal_signal[:len(existing_signal)])**2) if len(existing_signal) > 0 else 0
        
        teen_ber = 0.001 * len(teen_path) + 0.0001 * teen_latency
        existing_ber = 0.015 * len(existing_path) + 0.002 * existing_latency
        
        return {
            'teen': {
                'latency': round(teen_latency, 4),
                'mse': round(teen_mse, 6),
                'ber': round(teen_ber, 6),
                'path_length': len(teen_path),
                'hops': len(teen_path) - 1 if len(teen_path) > 0 else 0
            },
            'existing': {
                'latency': round(existing_latency, 4),
                'mse': round(existing_mse, 6),
                'ber': round(existing_ber, 6),
                'path_length': len(existing_path),
                'hops': len(existing_path) - 1 if len(existing_path) > 0 else 0
            }
        }

network_cache = {}

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/protocol')
def protocol():
    return render_template('protocol.html')

@app.route('/visualization')
def visualization():
    return render_template('visualization.html')

@app.route('/comparison')
def comparison():
    return render_template('comparison.html')

@app.route('/results')
def results():
    all_results = results_table.all()
    return render_template('results.html', results=all_results)

@app.route('/api/generate_network', methods=['POST'])
def generate_network():
    data = request.json
    num_nodes = int(data.get('num_nodes', 50))
    
    if num_nodes < 10:
        num_nodes = 10
    elif num_nodes > 200:
        num_nodes = 200
    
    network = SensorNetwork(num_nodes)
    network_cache['current'] = network
    
    simulations_table.insert({
        'num_nodes': num_nodes,
        'nodes': network.nodes,
        'edges_count': len(network.get_edges())
    })
    
    return jsonify({
        'nodes': network.nodes,
        'edges': network.get_edges(),
        'num_nodes': num_nodes
    })

@app.route('/api/find_path', methods=['POST'])
def find_path():
    data = request.json
    source = int(data.get('source', 0))
    destination = int(data.get('destination', 1))
    
    if 'current' not in network_cache:
        return jsonify({'error': 'No network generated. Please generate a network first.'}), 400
    
    network = network_cache['current']
    
    if source < 0 or source >= network.num_nodes or destination < 0 or destination >= network.num_nodes:
        return jsonify({'error': 'Invalid source or destination node.'}), 400
    
    if source == destination:
        return jsonify({'error': 'Source and destination must be different.'}), 400
    
    teen_path, teen_weight = network.get_teen_path(source, destination)
    existing_path, existing_weight = network.get_existing_protocol_path(source, destination)
    
    if not teen_path:
        return jsonify({'error': 'No path found between the selected nodes.'}), 400
    
    metrics = network.calculate_metrics(teen_path, existing_path)
    
    result_data = {
        'source': source,
        'destination': destination,
        'teen_path': teen_path,
        'existing_path': existing_path,
        'teen_weight': round(teen_weight, 4),
        'existing_weight': round(existing_weight, 4),
        'metrics': metrics,
        'num_nodes': network.num_nodes
    }
    
    results_table.insert(result_data)
    
    return jsonify(result_data)

@app.route('/api/clear_results', methods=['POST'])
def clear_results():
    results_table.truncate()
    return jsonify({'success': True})

@app.route('/api/get_results')
def get_results():
    all_results = results_table.all()
    return jsonify(all_results)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)
