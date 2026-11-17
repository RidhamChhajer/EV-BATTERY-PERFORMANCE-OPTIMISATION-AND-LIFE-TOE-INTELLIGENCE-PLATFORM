import pickle
OKPFX=('pandas.core.','numpy.','pandas._libs.')
OKEXACT={('builtins','slice'),('numpy','ndarray'),('numpy','dtype'),('_codecs','encode'),('collections','OrderedDict'),('pandas._libs.internals','_unpickle_block'),('pandas._libs.arrays','NDArrayBacked')}
class U(pickle.Unpickler):
    def find_class(self,m,n):
        if (m,n) in OKEXACT or (m.startswith(OKPFX) and not n.startswith('__') and 'eval' not in n and 'system' not in n): return super().find_class(m,n)
        raise pickle.UnpicklingError(f'blocked {m}.{n}')
def load(p):
    with open(p,'rb') as f: return U(f).load()
