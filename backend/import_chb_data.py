# -*- coding: utf-8 -*-

"""
Script para importar dados históricos de colheita de planilhas Excel (padrão CHB) para o Firestore.

Este script lê um arquivo Excel contendo dados de fazendas, toneladas e ATR,
processa os dados de cada linha e os insere na coleção 'historicalHarvests' do Firestore.

Uso:
  python import_chb_data.py <caminho_para_o_arquivo.xlsx> <companyId>

Argumentos:
  <caminho_para_o_arquivo.xlsx>  O caminho para o arquivo Excel a ser importado.
  <companyId>                      O ID da empresa a ser associado aos registros.

Requisitos:
  - pandas
  - firebase-admin
  - openpyxl
"""

import os
import sys
import pandas as pd
import firebase_admin
from firebase_admin import credentials, firestore
from datetime import datetime

def initialize_firestore():
    """
    Inicializa a conexão com o Firestore usando as credenciais de uma variável de ambiente.

    A variável de ambiente 'FIREBASE_APPLICATION_CREDENTIALS' deve ser definida com o
    caminho para o arquivo JSON de credenciais do Firebase.
    """
    cred_path = os.getenv('FIREBASE_APPLICATION_CREDENTIALS')
    if not cred_path:
        print("Erro: A variável de ambiente 'FIREBASE_APPLICATION_CREDENTIALS' não está definida.")
        print("Por favor, configure-a com o caminho para o seu arquivo de credenciais JSON do Firebase.")
        sys.exit(1)

    try:
        # Verifica se o app Firebase já foi inicializado para evitar erros
        if not firebase_admin._apps:
            cred = credentials.Certificate(cred_path)
            firebase_admin.initialize_app(cred)

        print("Conexão com o Firestore inicializada com sucesso.")
        return firestore.client()
    except Exception as e:
        print(f"Erro ao inicializar o Firestore: {e}")
        sys.exit(1)

def process_excel_file(file_path, company_id):
    """
    Lê uma planilha Excel e a transforma em uma lista de registros para o Firestore.

    Args:
        file_path (str): O caminho para o arquivo Excel.
        company_id (str): O ID da empresa a ser associado aos registros.

    Returns:
        list: Uma lista de dicionários, onde cada dicionário representa um registro válido.
    """
    try:
        df = pd.read_excel(file_path)
        print(f"Arquivo '{file_path}' lido com sucesso. Encontradas {len(df)} linhas.")
    except FileNotFoundError:
        print(f"Erro: O arquivo '{file_path}' não foi encontrado.")
        sys.exit(1)
    except Exception as e:
        print(f"Erro ao ler o arquivo Excel: {e}")
        sys.exit(1)

    # Normaliza os nomes das colunas (minúsculas, sem espaços)
    df.columns = [str(col).strip().lower() for col in df.columns]

    records_to_save = []
    required_columns = ['codigofazenda', 'toneladas', 'atr']

    # Valida se as colunas obrigatórias existem no DataFrame
    for col in required_columns:
        if col not in df.columns:
            print(f"Erro: A coluna obrigatória '{col}' não foi encontrada no arquivo Excel.")
            print(f"Colunas encontradas: {list(df.columns)}")
            sys.exit(1)

    for index, row in df.iterrows():
        try:
            # Extrai e converte os dados da linha
            codigo_fazenda = str(row['codigofazenda']).strip()

            # Converte para float, tratando vírgulas e valores não numéricos
            toneladas_str = str(row['toneladas']).replace(',', '.')
            toneladas = float(toneladas_str) if toneladas_str else 0.0

            atr_str = str(row['atr']).replace(',', '.')
            atr_realizado = float(atr_str) if atr_str else 0.0

            # Validação: só importa registros com dados essenciais e valores positivos
            if codigo_fazenda and toneladas > 0 and atr_realizado > 0:
                record = {
                    'companyId': company_id,
                    'codigoFazenda': codigo_fazenda,
                    'toneladas': toneladas,
                    'atrRealizado': atr_realizado,
                    'importedAt': datetime.now() # O SDK do Python converte para Timestamp do Firestore
                }
                records_to_save.append(record)
            else:
                print(f"Aviso: Linha {index + 2} ignorada por conter dados inválidos ou zerados.")

        except (ValueError, TypeError) as e:
            print(f"Aviso: Erro ao processar a linha {index + 2}. Dados podem estar em formato incorreto. Erro: {e}")
            continue

    return records_to_save

def save_to_firestore(db, records):
    """
    Salva uma lista de registros na coleção 'historicalHarvests' do Firestore em lotes.

    Args:
        db: A instância do cliente Firestore.
        records (list): A lista de registros a serem salvos.
    """
    if not records:
        print("Nenhum registro válido para salvar.")
        return

    collection_ref = db.collection('historicalHarvests')
    batch = db.batch()
    batch_size = 400  # O Firestore suporta até 500 operações por lote
    total_saved = 0

    for i, record in enumerate(records):
        doc_ref = collection_ref.document()
        batch.set(doc_ref, record)

        # Commita o lote a cada `batch_size` registros ou no último registro
        if (i + 1) % batch_size == 0 or (i + 1) == len(records):
            try:
                batch.commit()
                # O número de escritas é `len(batch._writes)` antes do commit
                print(f"Lote de {i - total_saved + 1} registros salvo com sucesso.")
                total_saved += (i - total_saved + 1)
                batch = db.batch()  # Reinicia o lote para o próximo conjunto
            except Exception as e:
                print(f"Erro crítico ao salvar lote no Firestore: {e}")
                # Decide se quer parar ou continuar em caso de erro
                sys.exit(1)

    print(f"\nImportação concluída. Total de {total_saved} registros salvos na coleção 'historicalHarvests'.")

def main():
    """
    Função principal para orquestrar o processo de importação.
    """
    if len(sys.argv) != 3:
        print("Uso: python import_chb_data.py <caminho_para_o_arquivo.xlsx> <companyId>")
        sys.exit(1)

    file_path = sys.argv[1]
    company_id = sys.argv[2]

    print("--- Iniciando Script de Importação de Histórico de Colheita ---")

    db = initialize_firestore()
    records = process_excel_file(file_path, company_id)

    save_to_firestore(db, records)

    print("--- Script de Importação Concluído ---")

if __name__ == '__main__':
    main()