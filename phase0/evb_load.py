import pickle, io, numpy as np
ALLOWED={('numpy.core.multiarray','scalar'),('numpy._core.multiarray','scalar'),('collections','OrderedDict'),('numpy','ndarray'),('numpy','dtype'),('_codecs','encode'),('numpy.core.multiarray','_reconstruct'),('numpy._core.multiarray','_reconstruct')}
class SafeU(pickle.Unpickler):
    def find_class(self,m,n):
        if (m,n) in ALLOWED: return super().find_class(m,n)
        raise pickle.UnpicklingError(f'blocked {m}.{n}')
def load(path):
    f=open(path,'rb'); out=[]
    while True:
        try: out.append(SafeU(f).load())
        except EOFError: break
    return out
